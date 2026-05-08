import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import {
  buildRateLimitHeaders,
  buildRateLimitKey,
  clearRateLimit,
  getClientIp,
  getRateLimitStatus,
  recordRateLimitFailure,
} from "@/lib/rate-limit";

const MAX_LOGIN_ATTEMPTS = 5;
const MAX_LOGIN_IP_ATTEMPTS = 50;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_ACTION = "auth.login";
const LOGIN_IP_RATE_LIMIT_ACTION = "auth.login.ip";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    const clientIp = getClientIp(request.headers);
    const attemptKey = buildRateLimitKey(clientIp, email || "empty");

    const [accountRateLimit, ipRateLimit] = await Promise.all([
      getRateLimitStatus({
        action: LOGIN_RATE_LIMIT_ACTION,
        key: attemptKey,
        limit: MAX_LOGIN_ATTEMPTS,
        windowMs: LOGIN_WINDOW_MS,
      }),
      getRateLimitStatus({
        action: LOGIN_IP_RATE_LIMIT_ACTION,
        key: clientIp,
        limit: MAX_LOGIN_IP_ATTEMPTS,
        windowMs: LOGIN_WINDOW_MS,
      }),
    ]);

    let blockedRateLimit: typeof accountRateLimit | null = null;
    if (!accountRateLimit.allowed) {
      blockedRateLimit = accountRateLimit;
    } else if (!ipRateLimit.allowed) {
      blockedRateLimit = ipRateLimit;
    }
    if (blockedRateLimit) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
        { status: 429, headers: buildRateLimitHeaders(blockedRateLimit) },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await compare(password, user.passwordHash))) {
      await Promise.all([
        recordRateLimitFailure({
          action: LOGIN_RATE_LIMIT_ACTION,
          key: attemptKey,
          limit: MAX_LOGIN_ATTEMPTS,
          windowMs: LOGIN_WINDOW_MS,
        }),
        recordRateLimitFailure({
          action: LOGIN_IP_RATE_LIMIT_ACTION,
          key: clientIp,
          limit: MAX_LOGIN_IP_ATTEMPTS,
          windowMs: LOGIN_WINDOW_MS,
        }),
      ]);
      return NextResponse.json({ error: "Credenciais invalidas." }, { status: 401 });
    }

    await clearRateLimit({ action: LOGIN_RATE_LIMIT_ACTION, key: attemptKey });

    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json(
      { error: "Nao foi possivel autenticar agora." },
      { status: 503 },
    );
  }
}
