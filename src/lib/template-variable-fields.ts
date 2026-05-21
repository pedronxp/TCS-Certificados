import {
  DATE_FIELD_KEYS,
  formatMonthNamePtBr,
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
  | "month"
  | "hours"
  | "period"
  | "hours_with_unit"
  | "hours_distribution"
  | "document_phrase"
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

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "março",
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
  month: "Mês",
  hours: "Carga horária",
  period: "Período do curso",
  hours_with_unit: "Carga horária com unidade",
  hours_distribution: "Complemento da carga horária",
  document_phrase: "Texto do documento do participante",
  course: "Curso",
  instructor: "Instrutor",
  system_code: "Código de validação",
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
  city: "Cidade de realização, ex.: Cataguases",
  date: "Data do certificado",
  long_date: "29 de novembro de 2019",
  month: "maio",
  hours: "16",
  period: "setembro de 2019",
  hours_with_unit: "40 horas",
  hours_distribution: ", distribuída nos dias 2, 3, 4, 5 e 6 de maio de 2026",
  document_phrase: ", portador(a) do CPF 000.000.000-00",
  course: "Nome do curso",
  instructor: "Nome do instrutor",
  system_code: "Preenchido automaticamente",
  shared: "",
};

const FIELD_DESCRIPTIONS: Record<TemplateFieldKind, string> = {
  recipient_name: "Nome que identifica a pessoa certificada.",
  email: "E-mail da pessoa certificada, quando o modelo exigir contato.",
  cpf: "Documento individual da pessoa certificada; cada linha do lote deve ter um CPF próprio.",
  cnpj: "Documento da empresa ou entidade jurídica, quando o modelo exigir CNPJ.",
  cpf_cnpj: "Documento aceito pelo modelo; informe CPF para pessoa física ou CNPJ para empresa.",
  rg: "Numero de identidade/RG da pessoa certificada. Se o modelo tiver UF separado, informe o estado no campo UF.",
  uf: "Estado emissor do RG/identidade; use a sigla com duas letras, como MG ou SP.",
  generic_document: "Documento individual usado pelo modelo. Em lote, cada pessoa deve ter seu próprio documento.",
  company: "Empresa vinculada ao certificado; normalmente fica igual para todo o lote.",
  city: "Cidade exibida no certificado; normalmente fica igual para todo o lote.",
  date: "Data exibida no certificado.",
  long_date: "Data por extenso exibida no certificado.",
  month: "Mês exibido no certificado, por extenso.",
  hours: "Carga horária exibida no certificado; normalmente fica igual para todo o lote.",
  period: "Período em que o curso ocorreu.",
  hours_with_unit: "Texto calculado a partir da carga horária, incluindo hora ou horas.",
  hours_distribution: "Texto calculado para cursos acima de 8 horas, distribuindo no máximo 8 horas por dia.",
  document_phrase: "Texto calculado a partir do CPF/documento. Fica vazio quando o documento não for informado.",
  course: "Nome do curso exibido no certificado.",
  instructor: "Nome do instrutor ou responsável exibido no certificado.",
  system_code: "Código gerado automaticamente pelo sistema para validação pública.",
  shared: "Campo do modelo que será preenchido no certificado.",
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
  carga_horaria_com_unidade: FIELD_LABELS.hours_with_unit,
  complemento_carga_horaria: FIELD_LABELS.hours_distribution,
  periodo_carga_horaria: FIELD_LABELS.hours_distribution,
  hora: FIELD_LABELS.hours,
  horas: FIELD_LABELS.hours,
  id: FIELD_LABELS.rg,
  identidade: FIELD_LABELS.rg,
  instrutor: FIELD_LABELS.instructor,
  mes: FIELD_LABELS.month,
  month: FIELD_LABELS.month,
  name: FIELD_LABELS.recipient_name,
  nome: FIELD_LABELS.recipient_name,
  participante: FIELD_LABELS.recipient_name,
  documento_participante_texto: FIELD_LABELS.document_phrase,
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
  month: ["mes", "month"],
  hours: ["hora", "horas", "carga_horaria"],
  period: ["periodo", "period"],
  hours_with_unit: ["carga_horaria_com_unidade", "horas_com_unidade"],
  hours_distribution: ["complemento_carga_horaria", "periodo_carga_horaria", "distribuicao_carga_horaria"],
  document_phrase: ["documento_participante_texto", "texto_documento_participante"],
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
  "month",
  "hours",
  "period",
  "course",
  "instructor",
]);

const CALCULATED_FIELD_KINDS = new Set<TemplateFieldKind>([
  "document_phrase",
  "hours_with_unit",
  "hours_distribution",
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
  if (hasAlias(key, label, "document_phrase")) return "document_phrase";
  if (hasAlias(key, label, "hours_with_unit")) return "hours_with_unit";
  if (hasAlias(key, label, "hours_distribution")) return "hours_distribution";
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

  if (hasAlias(key, label, "month") || hasAnyToken(allTokens, KIND_ALIASES.month)) {
    return "month";
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
  return kind !== "system_code" && !CALCULATED_FIELD_KINDS.has(kind) && !PER_PERSON_KINDS.has(kind);
}

export function getTemplateVariableDefaultRequired(variable: TemplateVariableIdentity) {
  return !isTemplateOptionalByRule(variable);
}

export function isTemplateVariableRequired(
  variable: TemplateVariableIdentity & { required?: boolean },
) {
  return !isTemplateOptionalByRule(variable) && Boolean(variable.required);
}

export function isTemplateCalculatedField(variable: TemplateVariableIdentity) {
  return CALCULATED_FIELD_KINDS.has(getTemplateFieldKind(variable));
}

export function applyCalculatedTemplateValues(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const next = { ...values };

  for (const variable of variables) {
    const kind = getTemplateFieldKind(variable);
    if (kind === "document_phrase") {
      next[variable.key] = buildParticipantDocumentText(variables, next);
    }

    if (kind === "hours_with_unit") {
      next[variable.key] = buildHoursWithUnit(variables, next);
    }

    if (kind === "hours_distribution") {
      next[variable.key] = buildHoursDistribution(variables, next);
    }
  }

  return next;
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
  if (getTemplateFieldKind(variable) === "month") return formatMonthNamePtBr(value);
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
    return onlyDigits(trimmed).length === 11 ? null : "CPF deve ter 11 dígitos.";
  }

  if (mode === "CNPJ") {
    return onlyDigits(trimmed).length === 14 ? null : "CNPJ deve ter 14 dígitos.";
  }

  if (mode === "CPF_CNPJ") {
    const digits = onlyDigits(trimmed).length;
    return digits === 11 || digits === 14 ? null : "Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.";
  }

  if (mode === "UF") {
    return BRAZIL_UFS.has(normalizeUf(trimmed)) ? null : "UF deve ser uma sigla válida com 2 letras.";
  }

  if (mode === "RG") {
    const normalized = normalizeRg(trimmed);
    const alphanumeric = normalized.replace(/[^A-Z0-9]/g, "");
    const digits = onlyDigits(normalized);
    if (alphanumeric.length < 5 || digits.length < 4) {
      return "Informe um RG/identidade válido para a pessoa.";
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

function isTemplateOptionalByRule(variable: TemplateVariableIdentity) {
  const kind = getTemplateFieldKind(variable);
  const key = normalizeFieldKey(variable.key);
  return kind === "cpf" || key === "doc" || CALCULATED_FIELD_KINDS.has(kind);
}

function buildParticipantDocumentText(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const candidate = findParticipantDocumentCandidate(variables, values);
  if (!candidate) return "";

  return `, portador(a) do ${candidate.label} ${candidate.value}`;
}

function findParticipantDocumentCandidate(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const candidates = variables
    .filter((variable) => !isTemplateCalculatedField(variable))
    .map((variable) => {
      const value = getValueForVariable(variable, values);
      return value ? { variable, value } : null;
    })
    .filter((item): item is { variable: TemplateVariableIdentity; value: string } => Boolean(item))
    .filter(({ variable }) => {
      const kind = getTemplateFieldKind(variable);
      return kind === "cpf" || kind === "cpf_cnpj" || kind === "generic_document" || kind === "rg";
    });

  const preferred =
    candidates.find(({ variable }) => getTemplateFieldKind(variable) === "cpf") ??
    candidates.find(({ variable }) => normalizeFieldKey(variable.key) === "doc") ??
    candidates[0];

  if (!preferred) return null;

  const kind = getTemplateFieldKind(preferred.variable);
  const digits = onlyDigits(preferred.value);
  if (kind === "cpf" || digits.length === 11) {
    return { label: "CPF", value: formatCpf(digits) };
  }

  if (kind === "cpf_cnpj" && digits.length === 14) {
    return { label: "CNPJ", value: formatCnpj(digits) };
  }

  if (kind === "rg") {
    return { label: "RG", value: normalizeRg(preferred.value) };
  }

  return { label: "documento", value: preferred.value.trim() };
}

function buildHoursWithUnit(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const variable = variables.find((item) => getTemplateFieldKind(item) === "hours");
  const value = variable ? getValueForVariable(variable, values) : "";
  const cleanValue = normalizeHoursValue(value);
  if (!cleanValue) return "";

  const numeric = Number(cleanValue.replace(",", "."));
  const unit = Number.isFinite(numeric) && numeric === 1 ? "hora" : "horas";
  return `${cleanValue} ${unit}`;
}

function buildHoursDistribution(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const hourCount = findHourCount(variables, values);
  if (!hourCount || hourCount <= 8) return "";

  const startDate = findCourseStartDate(variables, values);
  if (!startDate) return ", distribuída conforme cronograma do curso";

  const dayCount = Math.ceil(hourCount / 8);
  const dates = Array.from({ length: dayCount }, (_, index) => addDaysUtc(startDate, index));
  return `, distribuída nos dias ${formatDateListPtBr(dates)}`;
}

function findHourCount(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const variable = variables.find((item) => getTemplateFieldKind(item) === "hours");
  const value = variable ? getValueForVariable(variable, values) : "";
  const cleanValue = normalizeHoursValue(value).replace(",", ".");
  const parsed = Number(cleanValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findCourseStartDate(
  variables: TemplateVariableIdentity[],
  values: Record<string, string>,
) {
  const dateVariables = variables.filter((variable) => {
    const kind = getTemplateFieldKind(variable);
    return kind === "date" || kind === "long_date";
  });

  for (const variable of dateVariables) {
    const date = parseFlexibleDate(getValueForVariable(variable, values));
    if (date) return date;
  }

  const periodVariable = variables.find((variable) => getTemplateFieldKind(variable) === "period");
  const periodDate = periodVariable ? parseFlexibleDate(getValueForVariable(periodVariable, values)) : null;
  if (periodDate) return periodDate;

  const monthYear = periodVariable ? parseMonthYearPtBr(getValueForVariable(periodVariable, values)) : null;
  if (monthYear) return new Date(Date.UTC(monthYear.year, monthYear.month - 1, 1));

  return null;
}

function parseFlexibleDate(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return safeUtcDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const brMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (brMatch) return safeUtcDate(Number(brMatch[3]), Number(brMatch[2]), Number(brMatch[1]));

  const longMatch = normalizeComparableValue(trimmed).match(/^(\d{1,2}) de ([a-z]+) de (\d{4})$/);
  if (longMatch) {
    const month = monthNumberFromName(longMatch[2]);
    return month ? safeUtcDate(Number(longMatch[3]), month, Number(longMatch[1])) : null;
  }

  const monthYear = parseMonthYearPtBr(trimmed);
  return monthYear ? new Date(Date.UTC(monthYear.year, monthYear.month - 1, 1)) : null;
}

function parseMonthYearPtBr(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const isoMonthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (isoMonthMatch) return safeMonthYear(Number(isoMonthMatch[1]), Number(isoMonthMatch[2]));

  const normalized = normalizeComparableValue(trimmed);
  const monthYearMatch = normalized.match(/^([a-z]+) de (\d{4})$/);
  if (!monthYearMatch) return null;

  const month = monthNumberFromName(monthYearMatch[1]);
  return month ? { year: Number(monthYearMatch[2]), month } : null;
}

function safeUtcDate(year: number, month: number, day: number) {
  if (!safeMonthYear(year, month) || day < 1) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function safeMonthYear(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthNumberFromName(value: string) {
  const normalized = normalizeComparableValue(value);
  const index = MONTHS_PT.findIndex((month) => normalizeComparableValue(month) === normalized);
  return index >= 0 ? index + 1 : null;
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateListPtBr(dates: Date[]) {
  if (!dates.length) return "";
  const sameMonth = dates.every(
    (date) =>
      date.getUTCMonth() === dates[0].getUTCMonth() &&
      date.getUTCFullYear() === dates[0].getUTCFullYear(),
  );

  if (sameMonth) {
    return `${joinPtBr(dates.map((date) => String(date.getUTCDate())))} de ${MONTHS_PT[dates[0].getUTCMonth()]} de ${dates[0].getUTCFullYear()}`;
  }

  return joinPtBr(
    dates.map((date) => `${date.getUTCDate()} de ${MONTHS_PT[date.getUTCMonth()]} de ${date.getUTCFullYear()}`),
  );
}

function joinPtBr(parts: string[]) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

function normalizeHoursValue(value: string) {
  return String(value ?? "")
    .trim()
    .replace(/\s*(h|hr|hrs|hora|horas)\.?$/i, "")
    .trim();
}

function getValueForVariable(variable: TemplateVariableIdentity, values: Record<string, string>) {
  const direct = values[variable.key]?.trim();
  if (direct) return direct;

  const normalizedKey = normalizeFieldKey(variable.key);
  for (const [key, value] of Object.entries(values)) {
    if (normalizeFieldKey(key) === normalizedKey && value.trim()) return value.trim();
  }

  return "";
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
