import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildVerificationTemplateValues,
  generateNextVerificationCode,
  generateVerificationCode,
  isSystemCertificateVariableKey,
  normalizeVerificationCode,
  parseVerificationSequence,
} from "../src/lib/verification-code";

const standardCodePattern = /^TCS-BR-2026-\d{4}$/;

test("generates ordered Brazilian certificate validation codes with issue year", () => {
  const code = generateVerificationCode(1, new Date("2026-05-03T12:00:00-03:00"));

  assert.match(code, standardCodePattern);
  assert.equal(code, "TCS-BR-2026-0001");
});

test("uses the America/Sao_Paulo year at year boundaries", () => {
  const code = generateVerificationCode(42, new Date("2027-01-01T01:30:00.000Z"));

  assert.equal(code, "TCS-BR-2026-0042");
});

test("normalizes typed codes with spaces, case differences, or missing separators", () => {
  assert.equal(
    normalizeVerificationCode(" tcsbr20260001 "),
    "TCS-BR-2026-0001",
  );

  assert.equal(
    normalizeVerificationCode("tcs-br-2026-0001"),
    "TCS-BR-2026-0001",
  );
});

test("keeps legacy validation codes compatible", () => {
  assert.equal(normalizeVerificationCode(" abc123_xyz789 "), "ABC123_XYZ789");
  assert.equal(normalizeVerificationCode("TCS-BR-2026-0000"), "TCS-BR-2026-0000");
});

test("generates the next ordered code using the global system sequence", async () => {
  const code = await generateNextVerificationCode(
    async () => ["TCS-BR-2025-0009", "TCS-BR-2026-0001", "ABC123_XYZ789"],
    new Date("2026-05-03T12:00:00-03:00"),
  );

  assert.equal(code, "TCS-BR-2026-0010");
});

test("parses ordered verification sequences", () => {
  assert.equal(parseVerificationSequence("TCS-BR-2026-0042"), 42);
  assert.equal(parseVerificationSequence("ABC123_XYZ789"), null);
});

test("builds system template values for validation code placeholders", () => {
  assert.deepEqual(buildVerificationTemplateValues("TCS-BR-2026-0042"), {
    "Cód": "TCS-BR-2026-0042",
    "CÓD": "TCS-BR-2026-0042",
    "Código": "TCS-BR-2026-0042",
    "CÓDIGO": "TCS-BR-2026-0042",
    "Código de Validação": "TCS-BR-2026-0042",
    "CÓDIGO DE VALIDAÇÃO": "TCS-BR-2026-0042",
    Cod: "TCS-BR-2026-0042",
    Codigo: "TCS-BR-2026-0042",
    "Codigo de Validacao": "TCS-BR-2026-0042",
    cod: "TCS-BR-2026-0042",
    COD: "TCS-BR-2026-0042",
    codigo: "TCS-BR-2026-0042",
    codigo_de_validacao: "TCS-BR-2026-0042",
    verificationCode: "TCS-BR-2026-0042",
    verification_code: "TCS-BR-2026-0042",
    codigo_validacao: "TCS-BR-2026-0042",
    numero_validacao: "0042",
    sequencia_validacao: "0042",
  });
});

test("recognizes validation code placeholders as system-filled certificate variables", () => {
  assert.equal(isSystemCertificateVariableKey("COD"), true);
  assert.equal(isSystemCertificateVariableKey("cod"), true);
  assert.equal(isSystemCertificateVariableKey("codigo"), true);
  assert.equal(isSystemCertificateVariableKey("codigo_validacao"), true);
  assert.equal(isSystemCertificateVariableKey("Código de Validação"), true);
});
