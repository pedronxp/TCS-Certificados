import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildDefaultCertificateDeleteAt,
  DEFAULT_CERTIFICATE_VALIDITY_YEARS,
  isCertificateDocumentExpired,
} from "../src/lib/certificate-validity";

const originalValidityYears = process.env.CERTIFICATE_VALIDITY_YEARS;
const originalRetentionDays = process.env.CERTIFICATE_RETENTION_DAYS;

afterEach(() => {
  restoreEnv("CERTIFICATE_VALIDITY_YEARS", originalValidityYears);
  restoreEnv("CERTIFICATE_RETENTION_DAYS", originalRetentionDays);
});

test("defaults certificate validity to two calendar years", () => {
  delete process.env.CERTIFICATE_VALIDITY_YEARS;
  delete process.env.CERTIFICATE_RETENTION_DAYS;

  assert.equal(DEFAULT_CERTIFICATE_VALIDITY_YEARS, 2);
  assert.equal(
    buildDefaultCertificateDeleteAt(new Date("2026-05-03T12:00:00.000Z"))?.toISOString(),
    "2028-05-03T12:00:00.000Z",
  );
});

test("clamps leap-day certificates to the last valid day after two years", () => {
  delete process.env.CERTIFICATE_VALIDITY_YEARS;
  delete process.env.CERTIFICATE_RETENTION_DAYS;

  assert.equal(
    buildDefaultCertificateDeleteAt(new Date("2024-02-29T12:00:00.000Z"))?.toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
});

test("keeps retention days as a compatibility override", () => {
  delete process.env.CERTIFICATE_VALIDITY_YEARS;
  process.env.CERTIFICATE_RETENTION_DAYS = "10";

  assert.equal(
    buildDefaultCertificateDeleteAt(new Date("2026-05-03T12:00:00.000Z"))?.toISOString(),
    "2026-05-13T12:00:00.000Z",
  );
});

test("marks documents expired when deleteAt is at or before now", () => {
  const now = new Date("2026-05-03T12:00:00.000Z");

  assert.equal(isCertificateDocumentExpired(new Date("2026-05-03T12:00:00.000Z"), now), true);
  assert.equal(isCertificateDocumentExpired(new Date("2026-05-03T11:59:59.999Z"), now), true);
});

test("keeps future document deadlines available", () => {
  const now = new Date("2026-05-03T12:00:00.000Z");

  assert.equal(isCertificateDocumentExpired(new Date("2026-05-03T12:00:00.001Z"), now), false);
});

test("keeps documents without deleteAt available", () => {
  const now = new Date("2026-05-03T12:00:00.000Z");

  assert.equal(isCertificateDocumentExpired(null, now), false);
  assert.equal(isCertificateDocumentExpired(undefined, now), false);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
