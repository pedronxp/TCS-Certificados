"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TemplateVariable } from "@prisma/client";
import { BadgeCheck, Eye, LoaderCircle, X } from "lucide-react";
import { formatDateLongPtBr, formatMonthYearPtBr, isDateField } from "@/lib/date-fields";
import {
  applyCalculatedTemplateValues,
  formatTemplateFieldValue,
  getTemplateDocumentMode,
  getTemplateFieldMetadata,
  getTemplateVariableDescription,
  getTemplateVariableLabel,
  getTemplateVariablePlaceholder,
  isTemplateCalculatedField,
  isTemplateVariableRequired,
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
  const [documentFieldEnabled, setDocumentFieldEnabled] = useState<Record<string, boolean>>({});
  const [isTest, setIsTest] = useState(false);
  const [showTestInfo, setShowTestInfo] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const templateVariables = useMemo(() => selectedTemplate?.variables ?? [], [selectedTemplate]);
  const variables = useMemo(
    () => templateVariables.filter((variable) => !isTemplateCalculatedField(variable)),
    [templateVariables],
  );
  const lockedValues = useMemo(
    () => getLockedUserValues(templateVariables, currentUser),
    [currentUser, templateVariables],
  );
  const effectiveValues = useMemo(
    () => applyCalculatedTemplateValues(
      templateVariables,
      mirrorTemplateFieldValues(templateVariables, { ...values, ...lockedValues }),
    ),
    [lockedValues, values, templateVariables],
  );
  const requiredVariables = variables.filter(isTemplateVariableRequired);
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
    setDocumentFieldEnabled({});
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
      templateVariables.map((variable) => [variable.key, effectiveValues[variable.key]?.trim() ?? ""]),
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
        body: JSON.stringify({ templateId, values: buildPayloadValues(), isTest }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setMessage({
          type: "error",
          text: result?.error ?? "Não foi possível emitir o certificado.",
        });
        return;
      }

      const issue = await response.json() as { id?: string };
      router.push(issue.id ? `/certificados/concluido?issueId=${issue.id}` : "/certificados/historico");
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Não foi possível conectar ao servidor." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="dark-card-flat issue-form" style={{ padding: "1.35rem" }}>
      <div
        className="issue-form-header"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "end",
          gap: "1rem",
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: "1.15rem",
        }}
      >
        <label className="field issue-template-field">
          <span className="field-label">Modelo</span>
          <select value={templateId} onChange={(event) => updateTemplate(event.target.value)} required>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <div className="issue-status-list" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.5rem" }}>
          <span className="issue-status-chip" style={issueStatusChipStyle()}>{variables.length} campos</span>
          <span className="issue-status-chip" style={issueStatusChipStyle()}>
            {requiredVariables.length} obrigatórios
          </span>
          <span
            className={`issue-status-chip ${
              missingRequiredVariables.length || invalidFieldVariables.length
                ? "issue-status-chip-warning"
                : "issue-status-chip-success"
            }`}
            style={issueStatusChipStyle(
              missingRequiredVariables.length || invalidFieldVariables.length ? "warning" : "success",
            )}
          >
            {missingRequiredVariables.length || invalidFieldVariables.length ? "Pendente" : "Pronto"}
          </span>
        </div>
      </div>

      <div
        className="issue-fields-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "1.15rem 1.25rem",
          paddingTop: "1.35rem",
        }}
      >
        {variables.map((variable) => {
          const hasDocumentChoice = shouldUseDocumentChoice(variable, templateVariables);
          const documentEnabled = documentFieldEnabled[variable.key] ?? true;
          const commonProps = {
            className: isWideField(variable) ? "issue-field-wide" : undefined,
            variable,
            value: effectiveValues[variable.key] ?? "",
            dateValue: dateIsoValues[variable.key] ?? "",
            disabled: Object.hasOwn(lockedValues, variable.key),
            onValueChange: (nextValue: string) =>
              setValues((current) => ({ ...current, [variable.key]: nextValue })),
            onDateValueChange: (iso: string, formatted: string) => {
              setDateIsoValues((current) => ({ ...current, [variable.key]: iso }));
              setValues((current) => ({ ...current, [variable.key]: formatted }));
            },
          };

          if (!hasDocumentChoice) {
            return <CertificateField key={variable.id} {...commonProps} />;
          }

          return (
            <DocumentChoiceField
              key={variable.id}
              enabled={documentEnabled}
              onEnabledChange={(enabled) => {
                setDocumentFieldEnabled((current) => ({ ...current, [variable.key]: enabled }));
                if (!enabled) {
                  setValues((current) => ({ ...current, [variable.key]: "" }));
                }
              }}
            >
              {documentEnabled ? <CertificateField {...commonProps} /> : null}
            </DocumentChoiceField>
          );
        })}
      </div>

      {message ? (
        <p
          className={`issue-message ${
            message.type === "error"
              ? "issue-message-error"
              : "issue-message-info"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div
        className="issue-form-footer"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginTop: "1.35rem",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          background: "var(--surface-2)",
          padding: "0.85rem",
        }}
      >
        <div className="issue-footer-info" style={{ display: "flex", flex: "1 1 auto", flexWrap: "wrap", alignItems: "center", gap: "0.8rem 1rem" }}>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", fontWeight: 800 }}>
          {missingRequiredVariables.length
            ? `${missingRequiredVariables.length} campo(s) obrigatório(s) pendente(s)`
            : "Campos obrigatórios preenchidos"}
        </p>
        <label
          className="issue-test-toggle"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.65rem",
            border: "1px solid var(--border-subtle)",
            borderRadius: 8,
            background: "var(--surface-1)",
            padding: "0.55rem 0.7rem",
            color: "var(--text-secondary)",
          }}
        >
          <input
            type="checkbox"
            style={{ width: 16, height: 16, flex: "0 0 auto", accentColor: "var(--brand-600)" }}
            checked={isTest}
            onChange={(event) => {
              const checked = event.target.checked;
              setIsTest(checked);
              if (checked) setShowTestInfo(true);
            }}
          />
          <span style={{ display: "grid", gap: "0.05rem", textAlign: "left" }}>
            <strong>Teste</strong>
          <small style={{ color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 700 }}>
            não consome numeração oficial
          </small>
          </span>
        </label>
        </div>
        <div className="issue-actions" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.6rem" }}>
          <button
            type="button"
            disabled={!canPreview}
            onClick={openPreview}
            className="btn btn-ghost issue-action-button"
          >
            {previewLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />}
            {previewLoading ? "Gerando prévia" : "Ver prévia"}
          </button>
          <button
            disabled={!canSubmit}
            className="btn btn-primary issue-action-button"
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
      {showTestInfo ? <TestModeDialog onClose={() => setShowTestInfo(false)} /> : null}
    </form>
  );
}

function issueStatusChipStyle(tone?: "warning" | "success") {
  const base = {
    display: "inline-flex",
    minHeight: "1.8rem",
    alignItems: "center",
    border: "1px solid var(--border-subtle)",
    borderRadius: 8,
    background: "var(--surface-2)",
    color: "var(--text-secondary)",
    padding: "0.35rem 0.65rem",
    fontSize: "0.75rem",
    fontWeight: 800,
  } as const;

  if (tone === "warning") {
    return {
      ...base,
      borderColor: "color-mix(in oklch, var(--warning) 38%, transparent)",
      background: "var(--warning-soft)",
      color: "color-mix(in oklch, var(--warning) 82%, var(--text-primary))",
    } as const;
  }

  if (tone === "success") {
    return {
      ...base,
      borderColor: "color-mix(in oklch, var(--success) 38%, transparent)",
      background: "var(--success-soft)",
      color: "color-mix(in oklch, var(--success) 78%, var(--text-primary))",
    } as const;
  }

  return base;
}

function TestModeDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-slate-900">Modo teste ativado</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          A prévia não consome numeração. Ao gerar com a caixa Teste marcada, o sistema cria os arquivos para conferência com código TESTE e não avança a sequência oficial TCS-BR.
        </p>
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Entendi
        </button>
      </div>
    </div>
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
  const required = isTemplateVariableRequired(variable);

  return (
    <label className={`field ${className ?? ""}`} style={className === "issue-field-wide" ? { gridColumn: "1 / -1" } : undefined}>
      <span>
        {label}
        {required ? <b className="ml-1 text-red-600">*</b> : null}
      </span>
      <small className="text-xs font-medium leading-relaxed text-slate-500">{description}</small>
      {isDateField(variable) ? (
        <input
          type="date"
          required={required}
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
          required={required}
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
              required={required}
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
          required={required}
          value={value}
          disabled={disabled}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={getTemplateVariablePlaceholder(variable)}
        />
      )}
    </label>
  );
}

function DocumentChoiceField({
  enabled,
  onEnabledChange,
  children,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span>CPF no certificado</span>
      <small className="text-xs font-medium leading-relaxed text-slate-500">
        Escolha se o texto do certificado deve exibir CPF/documento do participante.
      </small>
      <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => onEnabledChange(true)}
          className={`rounded px-3 py-2 text-sm font-semibold transition ${
            enabled ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:bg-white/70"
          }`}
        >
          Com CPF
        </button>
        <button
          type="button"
          onClick={() => onEnabledChange(false)}
          className={`rounded px-3 py-2 text-sm font-semibold transition ${
            !enabled ? "bg-white text-teal-800 shadow-sm" : "text-slate-600 hover:bg-white/70"
          }`}
        >
          Sem CPF
        </button>
      </div>
      {children}
    </div>
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

function shouldUseDocumentChoice(
  variable: { key: string; label: string },
  variables: Array<{ key: string; label: string }>,
) {
  const kind = getTemplateFieldMetadata(variable).kind;
  const hasCalculatedDocumentText = variables.some(
    (item) => getTemplateFieldMetadata(item).kind === "document_phrase",
  );

  return hasCalculatedDocumentText && (
    kind === "cpf" ||
    kind === "cpf_cnpj" ||
    kind === "generic_document"
  );
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
