import {
  DATE_FIELD_KEYS,
  formatMonthYearPtBr,
  isDateField,
  isLongDateField,
  normalizeFieldKey,
} from "@/lib/date-fields";

export type TemplateVariableIdentity = {
  key: string;
  label?: string | null;
};

export type TemplateFieldKind =
  | "recipient_name"
  | "email"
  | "cpf"
  | "cnpj"
  | "cpf_cnpj"
  | "rg"
  | "uf"
  | "generic_document"
  | "company"
  | "city"
  | "date"
  | "long_date"
  | "hours"
  | "period"
  | "course"
  | "instructor"
  | "system_code"
  | "shared";

export type TemplateDocumentMode = "CPF" | "CNPJ" | "CPF_CNPJ" | "RG" | "UF" | "GENERIC";

export type TemplateFieldMetadata = {
  kind: TemplateFieldKind;
  label: string;
  placeholder: string;
  description: string;
  perPerson: boolean;
  documentMode: TemplateDocumentMode | null;
};

const BRAZIL_UFS = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

const FIELD_LABELS: Record<TemplateFieldKind, string> = {
  recipient_name: "Aluno",
  email: "E-mail",
  cpf: "CPF",
  cnpj: "CNPJ",
  cpf_cnpj: "CPF/CNPJ",
  rg: "RG",
  uf: "Estado (UF)",
  generic_document: "Documento",
  company: "Empresa",
  city: "Cidade",
  date: "Data",
  long_date: "Data por Extenso",
  hours: "Carga horaria",
  period: "Periodo do curso",
  course: "Curso",
  instructor: "Instrutor",
  system_code: "Codigo de validacao",
  shared: "",
};

const FIELD_PLACEHOLDERS: Record<TemplateFieldKind, string> = {
  recipient_name: "Nome completo do aluno",
  email: "email@empresa.com",
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  cpf_cnpj: "000.000.000-00 ou 00.000.000/0000-00",
  rg: "MG 12.345.678 ou 12.345.678-9",
  uf: "MG",
  generic_document: "CPF, RG ou outro documento",
  company: "Nome da empresa",
  city: "Cidade de realizacao, ex.: Cataguases",
  date: "Data do certificado",
  long_date: "29 de novembro de 2019",
  hours: "16",
  period: "setembro de 2019",
  course: "Nome do curso",
  instructor: "Nome do instrutor",
  system_code: "Preenchido automaticamente",
  shared: "",
};

const FIELD_DESCRIPTIONS: Record<TemplateFieldKind, string> = {
  recipient_name: "Nome que identifica a pessoa certificada.",
  email: "E-mail da pessoa certificada, quando o modelo exigir contato.",
  cpf: "Documento individual da pessoa certificada; cada linha do lote deve ter um CPF proprio.",
  cnpj: "Documento da empresa ou entidade juridica, quando o modelo exigir CNPJ.",
  cpf_cnpj: "Documento aceito pelo modelo; informe CPF para pessoa fisica ou CNPJ para empresa.",
  rg: "Numero de identidade/RG da pessoa certificada. Se o modelo tiver UF separado, informe o estado no campo UF.",
  uf: "Estado emissor do RG/identidade; use a sigla com duas letras, como MG ou SP.",
  generic_document: "Documento individual usado pelo modelo. Em lote, cada pessoa deve ter seu proprio documento.",
  company: "Empresa vinculada ao certificado; normalmente fica igual para todo o lote.",
  city: "Cidade exibida no certificado; normalmente fica igual para todo o lote.",
  date: "Data exibida no certificado.",
  long_date: "Data por extenso exibida no certificado.",
  hours: "Carga horaria exibida no certificado; normalmente fica igual para todo o lote.",
  period: "Periodo em que o curso ocorreu.",
  course: "Nome do curso exibido no certificado.",
  instructor: "Nome do instrutor ou responsavel exibido no certificado.",
  system_code: "Codigo gerado automaticamente pelo sistema para validacao publica.",
  shared: "Campo do modelo que sera preenchido no certificado.",
};

const FIELD_LABEL_ALIASES: Record<string, string> = {
  aluno: FIELD_LABELS.recipient_name,
  cnpj: FIELD_LABELS.cnpj,
  cpf: FIELD_LABELS.cpf,
  cpf_cnpj: FIELD_LABELS.cpf_cnpj,
  curso: FIELD_LABELS.course,
  data_extensa: FIELD_LABELS.long_date,
  data_extenso: FIELD_LABELS.long_date,
  data_por_extensa: FIELD_LABELS.long_date,
  data_por_extenso: FIELD_LABELS.long_date,
  doc: FIELD_LABELS.generic_document,
  document: FIELD_LABELS.generic_document,
  documento: FIELD_LABELS.generic_document,
  email: FIELD_LABELS.email,
  e_mail: FIELD_LABELS.email,
  empresa: FIELD_LABELS.company,
  hora: FIELD_LABELS.hours,
  horas: FIELD_LABELS.hours,
  id: FIELD_LABELS.rg,
  identidade: FIELD_LABELS.rg,
  instrutor: FIELD_LABELS.instructor,
  name: FIELD_LABELS.recipient_name,
  nome: FIELD_LABELS.recipient_name,
  participante: FIELD_LABELS.recipient_name,
  periodo: FIELD_LABELS.period,
  rg: FIELD_LABELS.rg,
  titular: FIELD_LABELS.recipient_name,
  uf: FIELD_LABELS.uf,
};

const KIND_ALIASES: Record<TemplateFieldKind, string[]> = {
  recipient_name: ["nome", "name", "aluno", "participante", "titular"],
  email: ["email", "e_mail"],
  cpf: ["cpf"],
  cnpj: ["cnpj"],
  cpf_cnpj: ["cpf_cnpj", "cpf_ou_cnpj", "documento_cpf_cnpj"],
  rg: ["id", "rg", "identidade"],
  uf: ["uf", "estado", "estado_uf"],
  generic_document: ["doc", "documento", "document"],
  company: ["empresa", "company"],
  city: ["cidade", "city"],
  date: [...DATE_FIELD_KEYS],
  long_date: [
    "data_extenso",
    "data_extensa",
    "data_por_extenso",
    "data_por_extensa",
  ],
  hours: ["hora", "horas", "carga_horaria"],
  period: ["periodo", "period"],
  course: ["curso", "course"],
  instructor: ["instrutor", "instructor"],
  system_code: ["cod", "codigo", "codigo_validacao"],
  shared: [],
};

const PER_PERSON_KINDS = new Set<TemplateFieldKind>([
  "recipient_name",
  "email",
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "rg",
  "uf",
  "generic_document",
]);

const MIRRORED_FIELD_KINDS = new Set<TemplateFieldKind>([
  "recipient_name",
  "company",
  "city",
  "hours",
  "period",
  "course",
  "instructor",
]);

export function getTemplateVariableLabel(variable: TemplateVariableIdentity) {
  return getTemplateFieldMetadata(variable).label;
}

export function getTemplateVariablePlaceholder(variable: TemplateVariableIdentity) {
  return getTemplateFieldMetadata(variable).placeholder;
}

export function getTemplateVariableDescription(variable: TemplateVariableIdentity) {
  return getTemplateFieldMetadata(variable).description;
}

export function getTemplateFieldMetadata(variable: TemplateVariableIdentity): TemplateFieldMetadata {
  const kind = getTemplateFieldKind(variable);
  const label = resolveFieldLabel(variable, kind);

  return {
    kind,
    label,
    placeholder: FIELD_PLACEHOLDERS[kind] || label,
    description: FIELD_DESCRIPTIONS[kind] || FIELD_DESCRIPTIONS.shared,
    perPerson: PER_PERSON_KINDS.has(kind),
    documentMode: getTemplateDocumentMode(variable),
  };
}

export function getTemplateFieldKind(variable: TemplateVariableIdentity): TemplateFieldKind {
  const key = normalizeFieldKey(variable.key);
  const label = normalizeFieldKey(variable.label ?? "");
  const keyTokens = tokens(key);
  const labelTokens = tokens(label);
  const allTokens = new Set([...keyTokens, ...labelTokens]);

  if (isSystemCodeKey(key) || isSystemCodeKey(label)) return "system_code";
  if (isLongDateField(variable)) return "long_date";
  if (isDateField(variable)) return "date";

  if (
    hasAlias(key, label, "recipient_name") ||
    hasAnyToken(allTokens, ["aluno", "participante", "titular"])
  ) {
    return "recipient_name";
  }

  if (hasAlias(key, label, "email") || hasAnyToken(allTokens, KIND_ALIASES.email)) {
    return "email";
  }

  const hasCpf = allTokens.has("cpf") || key.includes("cpf");
  const hasCnpj = allTokens.has("cnpj") || key.includes("cnpj");
  if (hasCpf && hasCnpj) return "cpf_cnpj";
  if (hasCpf) return "cpf";
  if (hasCnpj) return "cnpj";

  if (key === "id" || key === "rg" || label === "rg" || allTokens.has("rg") || allTokens.has("identidade")) {
    return "rg";
  }

  if (key === "uf" || key === "estado" || label === "uf" || label === "estado_uf") {
    return "uf";
  }

  if (hasAlias(key, label, "generic_document") || hasAnyToken(allTokens, KIND_ALIASES.generic_document)) {
    return "generic_document";
  }

  if (hasAlias(key, label, "company") || hasAnyToken(allTokens, KIND_ALIASES.company)) {
    return "company";
  }

  if (hasAlias(key, label, "city") || hasAnyToken(allTokens, KIND_ALIASES.city)) {
    return "city";
  }

  if (hasAlias(key, label, "hours") || hasAnyToken(allTokens, KIND_ALIASES.hours)) {
    return "hours";
  }

  if (hasAlias(key, label, "period") || hasAnyToken(allTokens, KIND_ALIASES.period)) {
    return "period";
  }

  if (hasAlias(key, label, "course") || hasAnyToken(allTokens, KIND_ALIASES.course)) {
    return "course";
  }

  if (hasAlias(key, label, "instructor") || hasAnyToken(allTokens, KIND_ALIASES.instructor)) {
    return "instructor";
  }

  return "shared";
}

export function getTemplateDocumentMode(variable: TemplateVariableIdentity): TemplateDocumentMode | null {
  switch (getTemplateFieldKind(variable)) {
    case "cpf":
      return "CPF";
    case "cnpj":
      return "CNPJ";
    case "cpf_cnpj":
      return "CPF_CNPJ";
    case "rg":
      return "RG";
    case "uf":
      return "UF";
    case "generic_document":
      return "GENERIC";
    default:
      return null;
  }
}

export function isTemplateRecipientField(variable: TemplateVariableIdentity) {
  return getTemplateFieldKind(variable) === "recipient_name";
}

export function isTemplateBatchPersonField(variable: TemplateVariableIdentity) {
  return getTemplateFieldMetadata(variable).perPerson;
}

export function isTemplateBatchSharedField(variable: TemplateVariableIdentity) {
  const kind = getTemplateFieldKind(variable);
  return kind !== "system_code" && !PER_PERSON_KINDS.has(kind);
}

export function dedupeTemplateFieldVariables<T extends TemplateVariableIdentity>(variables: T[]) {
  const seenMirroredKinds = new Set<TemplateFieldKind>();
  const result: T[] = [];

  for (const variable of variables) {
    const kind = getTemplateFieldKind(variable);
    if (MIRRORED_FIELD_KINDS.has(kind)) {
      if (seenMirroredKinds.has(kind)) continue;
      seenMirroredKinds.add(kind);
    }

    result.push(variable);
  }

  return result;
}

export function mirrorTemplateFieldValues(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const mirrored = { ...values };
  const groups = new Map<TemplateFieldKind, TemplateVariableIdentity[]>();

  for (const variable of variables) {
    const kind = getTemplateFieldKind(variable);
    if (!MIRRORED_FIELD_KINDS.has(kind)) continue;
    groups.set(kind, [...(groups.get(kind) ?? []), variable]);
  }

  for (const group of groups.values()) {
    const value = group
      .map((variable) => mirrored[variable.key]?.trim())
      .find(Boolean);
    if (!value) continue;

    for (const variable of group) {
      if (!mirrored[variable.key]?.trim()) mirrored[variable.key] = value;
    }
  }

  return mirrored;
}

export function getTemplateFieldAliases(variable: TemplateVariableIdentity) {
  const kind = getTemplateFieldKind(variable);
  const aliases = new Set<string>();

  for (const value of [variable.key, variable.label ?? ""]) {
    const normalized = normalizeFieldKey(value);
    if (normalized) aliases.add(normalized);
  }

  for (const alias of KIND_ALIASES[kind]) {
    aliases.add(alias);
  }

  return [...aliases];
}

export function formatTemplateFieldValue(variable: TemplateVariableIdentity, value: string) {
  if (getTemplateFieldKind(variable) === "period") return formatMonthYearPtBr(value);

  const mode = getTemplateDocumentMode(variable);
  if (mode === "CPF") return formatCpf(onlyDigits(value));
  if (mode === "CNPJ") return formatCnpj(onlyDigits(value));
  if (mode === "CPF_CNPJ") {
    const digits = onlyDigits(value);
    return digits.length > 11 ? formatCnpj(digits) : formatCpf(digits);
  }
  if (mode === "UF") return normalizeUf(value);
  if (mode === "RG") return normalizeRg(value);
  return String(value ?? "").trim();
}

export function validateTemplateFieldValue(variable: TemplateVariableIdentity, value: string) {
  const mode = getTemplateDocumentMode(variable);
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  if (mode === "CPF") {
    return onlyDigits(trimmed).length === 11 ? null : "CPF deve ter 11 digitos.";
  }

  if (mode === "CNPJ") {
    return onlyDigits(trimmed).length === 14 ? null : "CNPJ deve ter 14 digitos.";
  }

  if (mode === "CPF_CNPJ") {
    const digits = onlyDigits(trimmed).length;
    return digits === 11 || digits === 14 ? null : "Informe CPF com 11 digitos ou CNPJ com 14 digitos.";
  }

  if (mode === "UF") {
    return BRAZIL_UFS.has(normalizeUf(trimmed)) ? null : "UF deve ser uma sigla valida com 2 letras.";
  }

  if (mode === "RG") {
    const normalized = normalizeRg(trimmed);
    const alphanumeric = normalized.replace(/[^A-Z0-9]/g, "");
    const digits = onlyDigits(normalized);
    if (alphanumeric.length < 5 || digits.length < 4) {
      return "Informe um RG/identidade valido para a pessoa.";
    }
  }

  return null;
}

export function getTemplateDuplicateKey(variable: TemplateVariableIdentity, value: string) {
  const kind = getTemplateFieldKind(variable);
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  if (kind === "cpf" || kind === "cnpj" || kind === "cpf_cnpj") {
    const digits = onlyDigits(trimmed);
    return digits ? `${kind}:${digits}` : "";
  }

  if (kind === "rg") {
    const normalized = normalizeRg(trimmed).replace(/[^A-Z0-9]/g, "");
    return normalized ? `${kind}:${normalized}` : "";
  }

  if (kind === "generic_document") {
    const normalized = normalizeComparableValue(trimmed);
    return normalized ? `${kind}:${normalized}` : "";
  }

  if (kind === "recipient_name") {
    const normalized = normalizeComparableValue(trimmed);
    return normalized ? `${kind}:${normalized}` : "";
  }

  return "";
}

export function normalizeComparableValue(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function onlyDigits(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function resolveFieldLabel(variable: TemplateVariableIdentity, kind: TemplateFieldKind) {
  if (kind !== "shared") return FIELD_LABELS[kind];

  const key = normalizeFieldKey(variable.key);
  const label = normalizeFieldKey(variable.label ?? "");
  return FIELD_LABEL_ALIASES[key] ?? FIELD_LABEL_ALIASES[label] ?? cleanLabel(variable.label) ?? labelFromKey(key);
}

function cleanLabel(value: string | null | undefined) {
  const label = value?.trim();
  return label || undefined;
}

function labelFromKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hasAlias(key: string, label: string, kind: TemplateFieldKind) {
  const aliases = KIND_ALIASES[kind];
  return aliases.includes(key) || aliases.includes(label);
}

function hasAnyToken(source: Set<string>, expected: string[]) {
  return expected.some((item) => source.has(item));
}

function tokens(value: string) {
  return value.split("_").filter(Boolean);
}

function isSystemCodeKey(value: string) {
  return value === "cod" || value === "codigo" || value === "codigo_validacao";
}

function normalizeUf(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeRg(value: string) {
  const compact = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";

  const ufPrefix = compact.slice(0, 2);
  const hasUfPrefix = BRAZIL_UFS.has(ufPrefix) && /\d/.test(compact.slice(2));
  const prefix = hasUfPrefix ? ufPrefix : "";
  const body = hasUfPrefix ? compact.slice(2) : compact;
  const formattedBody = formatRgBody(body);

  return [prefix, formattedBody].filter(Boolean).join(" ");
}

function formatRgBody(value: string) {
  const checkDigitMatch = value.match(/^(\d{1,8})([A-Z])$/);
  if (checkDigitMatch) {
    return `${formatRgDigits(checkDigitMatch[1])}-${checkDigitMatch[2]}`;
  }

  if (/^\d+$/.test(value)) return formatRgDigits(value);
  return value;
}

function formatRgDigits(value: string) {
  const digits = value.slice(0, 12);
  if (digits.length <= 3) return digits;
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}-${digits.slice(8)}`;
  }

  const groups: string[] = [];
  let remaining = digits;
  const firstGroupSize = remaining.length % 3 || 3;
  groups.push(remaining.slice(0, firstGroupSize));
  remaining = remaining.slice(firstGroupSize);

  while (remaining.length) {
    groups.push(remaining.slice(0, 3));
    remaining = remaining.slice(3);
  }

  return groups.join(".");
}

function formatCpf(value: string) {
  const digits = value.slice(0, 11);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  const part4 = digits.slice(9, 11);

  return [part1, part2, part3].filter(Boolean).join(".") + (part4 ? `-${part4}` : "");
}

function formatCnpj(value: string) {
  const digits = value.slice(0, 14);
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 5);
  const part3 = digits.slice(5, 8);
  const part4 = digits.slice(8, 12);
  const part5 = digits.slice(12, 14);

  let formatted = part1;
  if (part2) formatted += `.${part2}`;
  if (part3) formatted += `.${part3}`;
  if (part4) formatted += `/${part4}`;
  if (part5) formatted += `-${part5}`;
  return formatted;
}
