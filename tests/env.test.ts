import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getRequiredProductionSecret, isPublicRegistrationEnabled } from "../src/lib/env";

const originalNodeEnv = process.env.NODE_ENV;
const originalSessionSecret = process.env.SESSION_SECRET;
const originalPublicRegistration = process.env.ALLOW_PUBLIC_REGISTRATION;

afterEach(() => {
  restoreEnv("NODE_ENV", originalNodeEnv);
  restoreEnv("SESSION_SECRET", originalSessionSecret);
  restoreEnv("ALLOW_PUBLIC_REGISTRATION", originalPublicRegistration);
});

test("uses the development fallback outside production", () => {
  process.env.NODE_ENV = "development";
  delete process.env.SESSION_SECRET;

  assert.equal(getRequiredProductionSecret("SESSION_SECRET", "dev-secret-change-me"), "dev-secret-change-me");
});

test("rejects missing or default secrets in production", () => {
  process.env.NODE_ENV = "production";
  delete process.env.SESSION_SECRET;

  assert.throws(
    () => getRequiredProductionSecret("SESSION_SECRET", "dev-secret-change-me"),
    /SESSION_SECRET/,
  );

  process.env.SESSION_SECRET = "dev-secret-change-me";
  assert.throws(
    () => getRequiredProductionSecret("SESSION_SECRET", "dev-secret-change-me"),
    /SESSION_SECRET/,
  );
});

test("public registration must be explicitly enabled", () => {
  delete process.env.ALLOW_PUBLIC_REGISTRATION;
  assert.equal(isPublicRegistrationEnabled(), false);

  process.env.ALLOW_PUBLIC_REGISTRATION = "true";
  assert.equal(isPublicRegistrationEnabled(), true);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
