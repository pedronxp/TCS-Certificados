"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateVariable } from "@prisma/client";
import { BadgeCheck, Eye, LoaderCircle, X } from "lucide-react";
import { formatDateLongPtBr, formatMonthYearPtBr, isDateField } from "@/lib/date-fields";
import {
  formatTemplateFieldValue,
  getTemplateDocumentMode,
  getTemplateFieldMetadata,
  getTemplateVariableDescription,
  getTemplateVariableLabel,
  getTemplateVariablePlaceholder,
  mirrorTemplateFieldValues,
  onlyDigits,
  validateTemplateFieldValue,
  type TemplateDocumentMode,
} from "@/lib/template-variable-fields";

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
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

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
    () => mirrorTemplateFieldValues(variables, { ...values, ...lockedValues }),
    [lockedValues, values, variables],
  );
  const requiredVariables = variables.filter((variable) => variable.required);
  const missingRequiredVariables = requiredVariables.filter(
    (variable) => !effectiveValues[variable.key]?.trim(),
  );
  const invalidFieldVariables = variables.filter((variable) =>
    Boolean(validateTemplateFieldValue(variable, effectiveValues[variable.key] ?? "")),
  );
  const canSubmit =
    Boolean(templateId) &&
    !loading &&
    !previewLoading &&
    missingRequiredVariables.length === 0 &&
    invalidFieldVariables.length === 0;
  const canPreview =
    Boolean(templateId) &&
    !loading &&
    !previewLoading &&
    missingRequiredVariables.length === 0 &&
    invalidFieldVariables.length === 0;

  useEffect(() => {
    if (!previewUrl) return;
    return () => window.URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function updateTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setMessage(null);
    setPreviewOpen(false);
  }

  function validateReady() {
    if (!selectedTemplate) {
      setMessage({ type: "error", text: "Selecione um modelo para emitir o certificado." });
      return false;
    }

    if (missingRequiredVariables.length) {
      setMessage({
        type: "error",
        text: `Preencha: ${missingRequiredVariables.map(getFieldLabel).join(", ")}.`,
      });
      return false;
    }

    if (invalidFieldVariables.length) {
      setMessage({
        type: "error",
        text: `Confira: ${invalidFieldVariables.map(getFieldLabel).join(", ")}.`,
      });
      return false;
    }

    return true;
  }

  function buildPayloadValues() {
    return Object.fromEntries(
      variables.map((variable) => [variable.key, effectiveValues[variable.key]?.trim() ?? ""]),
    );
  }

  async function openPreview() {
    if (!validateReady()) return;

    setPreviewLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/certificates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, values: buildPayloadValues() }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage({
          type: "error",
          text: result?.error ?? "Não foi possível gerar a prévia.",
        });
        return;
      }

      const blob = await response.blob();
      setPreviewUrl(window.URL.createObjectURL(blob));
      setPreviewOpen(true);
    } catch {
      setMessage({ type: "error", text: "Não foi possível conectar ao servidor." });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateReady()) return;

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/certificates/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, values: buildPayloadValues() }),
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
              missingRequiredVariables.length || invalidFieldVariables.length
                ? "bg-amber-50 text-amber-800"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {missingRequiredVariables.length || invalidFieldVariables.length ? "Pendente" : "Pronto"}
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canPreview}
            onClick={openPreview}
            className="inline-flex items-center gap-2 rounded-md border border-teal-700 bg-white px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {previewLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />}
            {previewLoading ? "Gerando prévia" : "Ver prévia"}
          </button>
          <button
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
            {loading ? "Gerando" : "Gerar PDF e arquivo"}
          </button>
        </div>
      </div>

      {previewOpen && previewUrl ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Prévia do certificado</h2>
                <p className="text-xs font-medium text-slate-500">Confira o layout antes de gerar os arquivos.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPreviewOpen(false)}
                title="Fechar prévia"
              >
                <X className="size-4" />
              </button>
            </div>
            <iframe
              title="Prévia do certificado"
              src={previewUrl}
              className="min-h-0 flex-1 bg-slate-100"
            />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Voltar e ajustar
              </button>
              <button
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <LoaderCircle className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                {loading ? "Gerando" : "Gerar PDF e arquivo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  const documentMode = getTemplateDocumentMode(variable);
  const validationError = validateTemplateFieldValue(variable, value);
  const label = getFieldLabel(variable);
  const description = getTemplateVariableDescription(variable);

  return (
    <label className={`field ${className ?? ""}`}>
      <span>
        {label}
        {variable.required ? <b className="ml-1 text-red-600">*</b> : null}
      </span>
      <small className="text-xs font-medium leading-relaxed text-slate-500">{description}</small>
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
      ) : isPeriodField(variable) ? (
        <input
          type="month"
          required={variable.required}
          value={dateValue}
          disabled={disabled}
          onChange={(event) => {
            const iso = event.target.value;
            onDateValueChange(iso, formatMonthYearPtBr(iso));
          }}
        />
      ) : documentMode ? (
        <div className="space-y-1.5">
          <div className="relative">
            <input
              required={variable.required}
              value={formatTemplateFieldValue(variable, value)}
              disabled={disabled}
              inputMode={isNumericDocumentMode(documentMode, value) ? "numeric" : "text"}
              autoComplete="off"
              maxLength={getDocumentMaxLength(documentMode)}
              aria-invalid={Boolean(validationError)}
              onChange={(event) => onValueChange(formatTemplateFieldValue(variable, event.target.value))}
              placeholder={getTemplateVariablePlaceholder(variable)}
              className="with-field-affix"
            />
            <strong
              className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[0.68rem] font-bold uppercase ${
                value.trim() && !validationError
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {getDocumentModeLabel(documentMode, value)}
            </strong>
          </div>
          {validationError ? (
            <small className="font-medium text-amber-700">
              {validationError}
            </small>
          ) : null}
        </div>
      ) : (
        <input
          required={variable.required}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={getTemplateVariablePlaceholder(variable)}
        />
      )}
    </label>
  );
}

function getFieldLabel(variable: { key: string; label: string }) {
  return getTemplateVariableLabel(variable);
}

function isWideField(variable: { key: string; label: string }) {
  return getTemplateFieldMetadata(variable).kind === "recipient_name";
}

function isPeriodField(variable: { key: string; label: string }) {
  return getTemplateFieldMetadata(variable).kind === "period";
}

function getLockedUserValues(
  variables: Array<{ key: string; label: string }>,
  currentUser: { name: string; email: string; role: "ADMIN" | "OPERADOR" },
) {
  if (currentUser.role === "ADMIN") return {};

  const locked: Record<string, string> = {};
  for (const variable of variables) {
    const kind = getTemplateFieldMetadata(variable).kind;
    if (kind === "recipient_name") {
      locked[variable.key] = currentUser.name;
      continue;
    }

    if (kind === "email") {
      locked[variable.key] = currentUser.email;
    }
  }

  return locked;
}

function isNumericDocumentMode(mode: TemplateDocumentMode, value: string) {
  if (mode === "CPF" || mode === "CNPJ") return true;
  if (mode === "CPF_CNPJ") return true;
  return mode === "GENERIC" && Boolean(onlyDigits(value));
}

function getDocumentMaxLength(mode: TemplateDocumentMode) {
  if (mode === "CPF") return 14;
  if (mode === "CNPJ" || mode === "CPF_CNPJ") return 18;
  if (mode === "UF") return 2;
  if (mode === "RG") return 24;
  return 48;
}

function getDocumentModeLabel(mode: TemplateDocumentMode, value: string) {
  if (mode === "CPF_CNPJ") return onlyDigits(value).length > 11 ? "CNPJ" : "CPF";
  if (mode === "GENERIC") return "DOC";
  return mode;
}
