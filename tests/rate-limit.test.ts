import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRateLimitHeaders,
  buildRateLimitKey,
  getClientIp,
  hashRateLimitKey,
} from "../src/lib/rate-limit";

test("builds normalized rate limit keys", () => {
  assert.equal(buildRateLimitKey(" 203.0.113.10 ", "USER@Example.COM "), "203.0.113.10:user@example.com");
});

test("extracts the first forwarded client ip", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.7, 10.0.0.1",
    "x-real-ip": "203.0.113.9",
  });

  assert.equal(getClientIp(headers), "198.51.100.7");
});

test("hashes rate limit keys without storing raw identifiers", () => {
  const hash = hashRateLimitKey("auth.login", "198.51.100.7:user@example.com");

  assert.equal(hash.length, 64);
  assert.equal(hash, hashRateLimitKey(" AUTH.LOGIN ", "198.51.100.7:USER@EXAMPLE.COM"));
  assert.equal(hash.includes("user@example.com"), false);
});

test("builds retry headers for blocked requests", () => {
  const headers = buildRateLimitHeaders({
    allowed: false,
    limit: 5,
    remaining: 0,
    resetAt: new Date("2026-05-05T12:00:00.000Z"),
    retryAfterSeconds: 120,
  });

  assert.equal(headers["Retry-After"], "120");
  assert.equal(headers["X-RateLimit-Limit"], "5");
  assert.equal(headers["X-RateLimit-Remaining"], "0");
  assert.equal(headers["X-RateLimit-Reset"], "2026-05-05T12:00:00.000Z");
});
