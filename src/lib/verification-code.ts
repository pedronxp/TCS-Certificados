export const VERIFICATION_CODE_PREFIX = "TCS-BR";

export const VERIFICATION_CODE_SEQUENCE_LENGTH = 4;
const SYSTEM_CERTIFICATE_VARIABLE_KEYS = new Set([
  "cod",
  "codigo",
  "codigo_de_validacao",
  "codigo_validacao",
  "verification_code",
  "verificationcode",
]);

export function generateVerificationCode(sequence: number, issuedAt = new Date()) {
  const year = getBrazilYear(issuedAt);
  return formatVerificationCode(year, sequence);
}

export async function generateNextVerificationCode(
  findExistingCodes: () => Promise<string[]>,
  issuedAt = new Date(),
) {
  const year = getBrazilYear(issuedAt);
  const existingCodes = await findExistingCodes();
  const nextSequence = findHighestSequence(existingCodes) + 1;

  return formatVerificationCode(year, nextSequence);
}

export function parseVerificationSequence(code: string) {
  const normalized = normalizeVerificationCode(code);
  const match = /^TCS-BR-(\d{4})-(\d+)$/.exec(normalized);
  if (!match) return null;

  const sequence = Number.parseInt(match[2], 10);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
}

export function buildVerificationTemplateValues(verificationCode: string) {
  const fullCode = normalizeVerificationCode(verificationCode) || verificationCode;
  const sequence = parseVerificationSequence(fullCode);
  const sequenceCode = sequence ? formatVerificationSequence(sequence) : fullCode;

  return {
    "Cód": fullCode,
    "CÓD": fullCode,
    "Código": fullCode,
    "CÓDIGO": fullCode,
    "Código de Validação": fullCode,
    "CÓDIGO DE VALIDAÇÃO": fullCode,
    Cod: fullCode,
    Codigo: fullCode,
    "Codigo de Validacao": fullCode,
    cod: fullCode,
    COD: fullCode,
    codigo: fullCode,
    codigo_de_validacao: fullCode,
    codigo_validacao: fullCode,
    numero_validacao: sequenceCode,
    sequencia_validacao: sequenceCode,
    verificationCode: fullCode,
    verification_code: fullCode,
  };
}

export function isSystemCertificateVariableKey(key: string) {
  return SYSTEM_CERTIFICATE_VARIABLE_KEYS.has(normalizeSystemKey(key));
}

export function normalizeVerificationCode(value: string | string[] | null | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const compact = trimmed.toUpperCase().replace(/[\s-]+/g, "");
  const prefix = VERIFICATION_CODE_PREFIX.replace("-", "");
  const standardMatch = new RegExp(`^${prefix}(\\d{4})(\\d+)$`).exec(compact);

  if (standardMatch) {
    const sequence = Number.parseInt(standardMatch[2], 10);
    if (Number.isFinite(sequence) && sequence > 0) {
      return formatVerificationCode(standardMatch[1], sequence);
    }
  }

  return trimmed.replace(/\s+/g, "").toUpperCase();
}

function findHighestSequence(codes: string[]) {
  return codes.reduce((highestSequence, code) => {
    const sequence = parseVerificationSequence(code);
    return sequence && sequence > highestSequence ? sequence : highestSequence;
  }, 0);
}

function formatVerificationCode(year: string, sequence: number) {
  const safeSequence = Number.isFinite(sequence) && sequence > 0 ? Math.trunc(sequence) : 1;
  const sequencePart = String(safeSequence).padStart(VERIFICATION_CODE_SEQUENCE_LENGTH, "0");

  return `${VERIFICATION_CODE_PREFIX}-${year}-${sequencePart}`;
}

function formatVerificationSequence(sequence: number) {
  return String(sequence).padStart(VERIFICATION_CODE_SEQUENCE_LENGTH, "0");
}

function normalizeSystemKey(key: string) {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function getBrazilYear(date: Date) {
  const yearPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
  })
    .formatToParts(date)
    .find((part) => part.type === "year");

  return yearPart?.value ?? String(date.getFullYear());
}
