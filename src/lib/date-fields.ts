export type DateFieldIdentity = {
  key: string;
  label?: string | null;
};

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "mar\u00e7o",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export const DATE_FIELD_KEYS = [
  "data",
  "date",
  "data_emissao",
  "data_de_emissao",
  "emissao",
  "data_conclusao",
  "data_inicio",
  "data_extenso",
  "data_extensa",
  "data_por_extenso",
  "data_por_extensa",
  "data_de_emissao_por_extenso",
  "data_emissao_por_extenso",
] as const;

const DATE_FIELD_KEY_SET = new Set<string>(DATE_FIELD_KEYS);

export function normalizeFieldKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isDateField(field: DateFieldIdentity) {
  const key = normalizeFieldKey(field.key);
  const label = normalizeFieldKey(field.label ?? "");

  return isDateFieldKey(key) || isDateFieldKey(label);
}

export function isLongDateField(field: DateFieldIdentity) {
  const key = normalizeFieldKey(field.key);
  const label = normalizeFieldKey(field.label ?? "");

  return isLongDateKey(key) || isLongDateKey(label);
}

export function formatDateLongPtBr(value: string) {
  const trimmed = String(value ?? "").trim();
  const date = parseDateParts(trimmed);
  if (!date) return trimmed;

  return `${date.day} de ${MONTHS_PT[date.month - 1]} de ${date.year}`;
}

function isDateFieldKey(value: string) {
  return DATE_FIELD_KEY_SET.has(value) || isLongDateKey(value);
}

function isLongDateKey(value: string) {
  return (
    value === "data_extenso" ||
    value === "data_extensa" ||
    value === "data_por_extenso" ||
    value === "data_por_extensa" ||
    (value.startsWith("data") && value.includes("extenso"))
  );
}

function parseDateParts(value: string) {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return validDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const brMatch = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (brMatch) {
    return validDateParts(Number(brMatch[3]), Number(brMatch[2]), Number(brMatch[1]));
  }

  return null;
}

function validDateParts(year: number, month: number, day: number) {
  if (!year || !month || !day || month < 1 || month > 12) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}
