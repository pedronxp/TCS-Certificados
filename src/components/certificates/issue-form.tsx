"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateVariable } from "@prisma/client";
import { BadgeCheck, LoaderCircle } from "lucide-react";
import { formatDateLongPtBr, isDateField, isLongDateField } from "@/lib/date-fields";

type FormMessage = {
  type: "error" | "info";
  text: string;
};

export function IssueForm({
  templates,
  initialTemplateId,
  currentUser,
}: {
  templates: Array<{
    id: string;
    name: string;
    variables: TemplateVariable[];
  }>;
  initialTemplateId?: string;
  currentUser: { name: string; email: string; role: "ADMIN" | "OPERADOR" };
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(
    templates.some((template) => template.id === initialTemplateId)
      ? initialTemplateId ?? templates[0]?.id ?? ""
      : templates[0]?.id ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [dateIsoValues, setDateIsoValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const variables = useMemo(() => selectedTemplate?.variables ?? [], [selectedTemplate]);
  const lockedValues = useMemo(
    () => getLockedUserValues(variables, currentUser),
    [currentUser, variables],
  );
  const effectiveValues = useMemo(
    () => ({ ...values, ...lockedValues }),
    [lockedValues, values],
  );
  const requiredVariables = variables.filter((variable) => variable.required);
  const missingRequiredVariables = requiredVariables.filter(
    (variable) => !effectiveValues[variable.key]?.trim(),
  );
  const invalidDocumentVariables = variables.filter((variable) => {
    const state = getDocumentState(variable, effectiveValues[variable.key] ?? "");
    return Boolean(state && state.digits.length > 0 && !state.complete);
  });
  const canSubmit =
    Boolean(templateId) &&
    !loading &&
    missingRequiredVariables.length === 0 &&
    invalidDocumentVariables.length === 0;

  function updateTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setMessage(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTemplate) {
      setMessage({ type: "error", text: "Selecione um modelo para emitir o certificado." });
      return;
    }

    if (missingRequiredVariables.length) {
      setMessage({
        type: "error",
        text: `Preencha: ${missingRequiredVariables.map(getFieldLabel).join(", ")}.`,
      });
      return;
    }

    if (invalidDocumentVariables.length) {
      setMessage({
        type: "error",
        text: `Confira o documento: ${invalidDocumentVariables.map(getFieldLabel).join(", ")}.`,
      });
      return;
    }

    const payloadValues = Object.fromEntries(
      variables.map((variable) => [variable.key, effectiveValues[variable.key]?.trim() ?? ""]),
    );

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/certificates/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, values: payloadValues }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage({
          type: "error",
          text: result?.error ?? "Não foi possível emitir o certificado.",
        });
        return;
      }

      router.push("/certificados/historico");
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Não foi possível conectar ao servidor." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="grid gap-4 border-b border-slate-100 pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="field min-w-0">
          <span>Modelo</span>
          <select value={templateId} onChange={(event) => updateTemplate(event.target.value)} required>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600 lg:justify-end">
          <span className="rounded bg-slate-100 px-2.5 py-1.5">{variables.length} campos</span>
          <span className="rounded bg-slate-100 px-2.5 py-1.5">
            {requiredVariables.length} obrigatórios
          </span>
          <span
            className={`rounded px-2.5 py-1.5 ${
              missingRequiredVariables.length || invalidDocumentVariables.length
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {missingRequiredVariables.length || invalidDocumentVariables.length ? "Pendente" : "Pronto"}
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:gap-5">
        {variables.map((variable) => (
          <CertificateField
            key={variable.id}
            className={isWideField(variable) ? "md:col-span-2" : undefined}
            variable={variable}
            value={effectiveValues[variable.key] ?? ""}
            dateValue={dateIsoValues[variable.key] ?? ""}
            disabled={Object.hasOwn(lockedValues, variable.key)}
            onValueChange={(nextValue) =>
              setValues((current) => ({ ...current, [variable.key]: nextValue }))
            }
            onDateValueChange={(iso, formatted) => {
              setDateIsoValues((current) => ({ ...current, [variable.key]: iso }));
              setValues((current) => ({ ...current, [variable.key]: formatted }));
            }}
          />
        ))}
      </div>

      {message ? (
        <p
          className={`mt-5 rounded-md px-3 py-2 text-sm font-medium ${
            message.type === "error"
              ? "bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 px-4 py-3">
        <p className="text-sm font-medium text-slate-500">
          {missingRequiredVariables.length
            ? `${missingRequiredVariables.length} campo(s) obrigatório(s) pendente(s)`
            : "Campos obrigatórios preenchidos"}
        </p>
        <button
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
          {loading ? "Gerando" : "Gerar PDF e DOCX"}
        </button>
      </div>
    </form>
  );
}

function CertificateField({
  variable,
  value,
  dateValue,
  disabled,
  className,
  onValueChange,
  onDateValueChange,
}: {
  variable: TemplateVariable;
  value: string;
  dateValue: string;
  disabled?: boolean;
  className?: string;
  onValueChange: (value: string) => void;
  onDateValueChange: (isoDate: string, formattedDate: string) => void;
}) {
  const documentState = getDocumentState(variable, value);
  const label = getFieldLabel(variable);

  return (
    <label className={`field ${className ?? ""}`}>
      <span>
        {label}
        {variable.required ? <b className="ml-1 text-red-600">*</b> : null}
      </span>
      {isDateField(variable) ? (
        <input
          type="date"
          required={variable.required}
          value={dateValue}
          disabled={disabled}
          onChange={(event) => {
            const iso = event.target.value;
            onDateValueChange(iso, formatDateLongPtBr(iso));
          }}
        />
      ) : documentState ? (
        <div className="space-y-1.5">
          <div className="relative">
            <input
              required={variable.required}
              value={documentState.formatted}
              disabled={disabled}
              inputMode="numeric"
              autoComplete="off"
              maxLength={documentState.maxLength}
              aria-invalid={documentState.digits.length > 0 && !documentState.complete}
              onChange={(event) => onValueChange(formatDocumentValue(variable, event.target.value))}
              placeholder={documentState.placeholder}
              className="with-field-affix"
            />
            <strong
              className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[0.68rem] font-bold uppercase ${
                documentState.complete
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {documentState.label}
            </strong>
          </div>
          {documentState.digits.length > 0 && !documentState.complete ? (
            <small className="font-medium text-amber-700">
              Informe {documentState.expectedLength} dígitos para {documentState.label}.
            </small>
          ) : null}
        </div>
      ) : (
        <input
          required={variable.required}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={`{{${variable.key}}}`}
        />
      )}
    </label>
  );
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

type DocumentMode = "CPF" | "CNPJ" | "CPF_CNPJ";

function getFieldLabel(variable: { key: string; label: string }) {
  if (isLongDateField(variable)) return "Data por Extenso";

  const normalizedLabel = normalizeKey(variable.label);
  if (normalizedLabel === "cpf") return "CPF";
  if (normalizedLabel === "cnpj") return "CNPJ";

  return variable.label;
}

function isWideField(variable: { key: string; label: string }) {
  const key = normalizeKey(variable.key);
  const label = normalizeKey(variable.label);

  return (
    key === "nome" ||
    label === "nome" ||
    key === "name" ||
    label === "name" ||
    key === "aluno" ||
    label === "aluno"
  );
}

function getLockedUserValues(
  variables: Array<{ key: string; label: string }>,
  currentUser: { name: string; email: string; role: "ADMIN" | "OPERADOR" },
) {
  if (currentUser.role === "ADMIN") return {};

  const locked: Record<string, string> = {};
  for (const variable of variables) {
    const field = normalizeKey(`${variable.key}_${variable.label}`);
    if (
      field.includes("nome") ||
      field.includes("name") ||
      field.includes("participante") ||
      field.includes("aluno") ||
      field.includes("titular")
    ) {
      locked[variable.key] = currentUser.name;
      continue;
    }

    if (field.includes("email") || field.includes("e_mail")) {
      locked[variable.key] = currentUser.email;
    }
  }

  return locked;
}

function getDocumentMode(variable: { key: string; label: string }): DocumentMode | null {
  const key = normalizeKey(variable.key);
  const label = normalizeKey(variable.label);
  const combined = `${key}_${label}`;
  const hasCpf = combined.includes("cpf");
  const hasCnpj = combined.includes("cnpj");
  const hasDocument = combined.includes("documento") || combined.includes("document");

  if (hasCpf && hasCnpj) return "CPF_CNPJ";
  if (hasCpf) return "CPF";
  if (hasCnpj) return "CNPJ";
  if (hasDocument) return "CPF_CNPJ";

  return null;
}

function getDocumentState(variable: { key: string; label: string }, value: string) {
  const mode = getDocumentMode(variable);
  if (!mode) return null;

  const digits = onlyDigits(value);
  const inferredType = inferDocumentType(mode, digits);
  const expectedLength = inferredType === "CNPJ" ? 14 : 11;
  const formatted = inferredType === "CNPJ" ? formatCnpj(digits) : formatCpf(digits);

  return {
    digits,
    formatted,
    label: inferredType,
    complete: digits.length === expectedLength,
    expectedLength,
    maxLength: mode === "CPF" ? 14 : 18,
    placeholder: mode === "CNPJ" ? "00.000.000/0000-00" : "000.000.000-00",
  };
}

function inferDocumentType(mode: DocumentMode, digits: string) {
  if (mode === "CPF") return "CPF";
  if (mode === "CNPJ") return "CNPJ";
  return digits.length > 11 ? "CNPJ" : "CPF";
}

function formatDocumentValue(variable: { key: string; label: string }, value: string) {
  const mode = getDocumentMode(variable) ?? "CPF_CNPJ";
  const digits = onlyDigits(value).slice(0, mode === "CPF" ? 11 : 14);
  const type = inferDocumentType(mode, digits);
  return type === "CNPJ" ? formatCnpj(digits) : formatCpf(digits);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
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
