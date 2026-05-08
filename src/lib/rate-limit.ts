import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

type HeaderReader = {
  get(name: string): string | null;
};

type RateLimitOptions = {
  action: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: Date;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

export function getClientIp(headers: HeaderReader) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const cfIp = headers.get("cf-connecting-ip")?.trim();
  const forwarded = headers.get("forwarded");
  const forwardedIp = forwarded?.match(/for="?([^;,"]+)/i)?.[1]?.trim();

  return normalizeRateLimitPart(forwardedFor || realIp || cfIp || forwardedIp || "unknown");
}

export function buildRateLimitKey(...parts: Array<string | number | null | undefined>) {
  return parts.map((part) => normalizeRateLimitPart(part)).join(":");
}

export function hashRateLimitKey(action: string, key: string) {
  return createHash("sha256")
    .update(`${normalizeRateLimitPart(action)}\0${normalizeRateLimitPart(key)}`)
    .digest("hex");
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt.toISOString(),
  };
}

export async function getRateLimitStatus(options: RateLimitOptions) {
  const normalized = normalizeRateLimitOptions(options);
  const attempt = await prisma.rateLimitAttempt.findUnique({
    where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
  });

  if (!attempt || attempt.resetAt <= normalized.now) {
    return buildResult({
      count: 0,
      limit: normalized.limit,
      resetAt: normalized.resetAt,
      now: normalized.now,
      allowed: true,
    });
  }

  return buildResult({
    count: attempt.count,
    limit: normalized.limit,
    resetAt: attempt.resetAt,
    now: normalized.now,
    allowed: attempt.count < normalized.limit,
  });
}

export async function consumeRateLimit(options: RateLimitOptions) {
  const normalized = normalizeRateLimitOptions(options);
  await pruneExpiredRateLimits(normalized.action, normalized.now);

  const attempt = await prisma.rateLimitAttempt.findUnique({
    where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
  });

  if (attempt && attempt.resetAt > normalized.now && attempt.count >= normalized.limit) {
    return buildResult({
      count: attempt.count,
      limit: normalized.limit,
      resetAt: attempt.resetAt,
      now: normalized.now,
      allowed: false,
    });
  }

  const nextAttempt =
    !attempt || attempt.resetAt <= normalized.now
      ? await prisma.rateLimitAttempt.upsert({
          where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
          update: { count: 1, resetAt: normalized.resetAt },
          create: {
            action: normalized.action,
            keyHash: normalized.keyHash,
            count: 1,
            resetAt: normalized.resetAt,
          },
        })
      : await prisma.rateLimitAttempt.update({
          where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
          data: { count: { increment: 1 } },
        });

  return buildResult({
    count: nextAttempt.count,
    limit: normalized.limit,
    resetAt: nextAttempt.resetAt,
    now: normalized.now,
    allowed: nextAttempt.count <= normalized.limit,
  });
}

export async function recordRateLimitFailure(options: RateLimitOptions) {
  const normalized = normalizeRateLimitOptions(options);

  const attempt = await prisma.rateLimitAttempt.findUnique({
    where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
  });

  const nextAttempt =
    !attempt || attempt.resetAt <= normalized.now
      ? await prisma.rateLimitAttempt.upsert({
          where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
          update: { count: 1, resetAt: normalized.resetAt },
          create: {
            action: normalized.action,
            keyHash: normalized.keyHash,
            count: 1,
            resetAt: normalized.resetAt,
          },
        })
      : await prisma.rateLimitAttempt.update({
          where: { action_keyHash: { action: normalized.action, keyHash: normalized.keyHash } },
          data: { count: { increment: 1 } },
        });

  return buildResult({
    count: nextAttempt.count,
    limit: normalized.limit,
    resetAt: nextAttempt.resetAt,
    now: normalized.now,
    allowed: nextAttempt.count < normalized.limit,
  });
}

export async function clearRateLimit(options: Pick<RateLimitOptions, "action" | "key">) {
  await prisma.rateLimitAttempt.deleteMany({
    where: {
      action: normalizeRateLimitPart(options.action),
      keyHash: hashRateLimitKey(options.action, options.key),
    },
  });
}

async function pruneExpiredRateLimits(action: string, now: Date) {
  await prisma.rateLimitAttempt.deleteMany({
    where: {
      action,
      resetAt: { lte: now },
    },
  });
}

function normalizeRateLimitOptions(options: RateLimitOptions) {
  const now = options.now ?? new Date();
  const action = normalizeRateLimitPart(options.action);
  const key = normalizeRateLimitPart(options.key);
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));

  return {
    action,
    keyHash: hashRateLimitKey(action, key),
    limit,
    now,
    resetAt: new Date(now.getTime() + windowMs),
  };
}

function buildResult({
  count,
  limit,
  resetAt,
  now,
  allowed,
}: {
  count: number;
  limit: number;
  resetAt: Date;
  now: Date;
  allowed: boolean;
}): RateLimitResult {
  const remaining = Math.max(limit - count, 0);

  return {
    allowed,
    limit,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
  };
}

function normalizeRateLimitPart(value: unknown) {
  return String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}
