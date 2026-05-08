export type PublicValidationIssue = {
  recipient: {
    document: string | null;
  };
  values: unknown;
};

const DOCUMENT_KEYS = new Set([
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "cpf_ou_cnpj",
  "documento",
  "document",
  "doc",
  "id",
  "rg",
  "identidade",
]);

export function verifyIssueDocument(issue: PublicValidationIssue, documentValue: string) {
  const provided = normalizeDocumentForCompare(documentValue);
  if (!provided.value) return { matched: false, hasInput: false };

  for (const candidate of getIssueDocumentCandidates(issue)) {
    if (documentsMatch(provided, normalizeDocumentForCompare(candidate))) {
      return { matched: true, hasInput: true };
    }
  }

  return { matched: false, hasInput: true };
}

export function getIssueDocumentCandidates(issue: PublicValidationIssue) {
  const candidates = new Set<string>();
  const recipientDocument = issue.recipient.document?.trim();
  if (recipientDocument) candidates.add(recipientDocument);

  const values = readValues(issue.values);
  const rg = findFirstValue(values, ["id", "rg", "identidade"]);
  const uf = findFirstValue(values, ["uf", "estado", "estado_uf"]);

  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = normalizeKey(key);
    const rgKeyWithState = uf && ["id", "rg", "identidade"].includes(normalizedKey);
    if (rgKeyWithState) continue;

    if (DOCUMENT_KEYS.has(normalizedKey) && value.trim()) {
      candidates.add(value.trim());
    }
  }

  if (rg && uf) {
    candidates.add(`${uf} ${rg}`);
  } else if (rg) {
    candidates.add(rg);
  }

  return [...candidates];
}

export function maskDocumentForDisplay(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/****-**`;

  const normalized = raw.replace(/\s+/g, " ");
  if (normalized.length <= 4) return "****";
  return `${normalized.slice(0, 2)}${"*".repeat(Math.min(6, normalized.length - 4))}${normalized.slice(-2)}`;
}

function documentsMatch(
  provided: ReturnType<typeof normalizeDocumentForCompare>,
  candidate: ReturnType<typeof normalizeDocumentForCompare>,
) {
  if (!provided.value || !candidate.value) return false;
  if (provided.value === candidate.value) return true;

  if (/[A-Z]/.test(provided.value) || /[A-Z]/.test(candidate.value)) {
    return false;
  }

  if (provided.digits.length >= 5 && candidate.digits.length >= 5) {
    return provided.digits === candidate.digits;
  }

  return false;
}

function normalizeDocumentForCompare(value: string) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  return {
    value: normalized,
    digits: normalized.replace(/\D/g, ""),
  };
}

function readValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item ?? "").trim()]),
  );
}

function findFirstValue(values: Record<string, string>, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(values)) {
    if (!value.trim()) continue;
    const normalizedKey = normalizeKey(key);
    if (normalizedAliases.has(normalizedKey)) {
      return value.trim();
    }
  }

  return "";
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
