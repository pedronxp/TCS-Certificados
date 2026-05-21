"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Upload } from "lucide-react";
import { notifyBatchJobStarted } from "@/components/certificates/batch-progress-toast";
import { buildBatchResultMessage } from "@/lib/batch-result-message";
import { formatDateLongPtBr, formatMonthYearPtBr, isDateField } from "@/lib/date-fields";
import {
  formatTemplateFieldValue,
  dedupeTemplateFieldVariables,
  getTemplateDuplicateKey,
  getTemplateFieldMetadata,
  getTemplateVariableDescription,
  getTemplateVariableLabel,
  getTemplateVariablePlaceholder,
  isTemplateBatchPersonField,
  isTemplateBatchSharedField,
  isTemplateRecipientField,
  isTemplateVariableRequired,
  validateTemplateFieldValue,
} from "@/lib/template-variable-fields";

type BatchResult = {
  jobId?: string;
  total?: number;
  processed?: number;
  created?: number;
  status?: "running" | "completed" | "failed";
  errors?: string[];
  error?: string;
};

type BatchTemplate = {
  id: string;
  name: string;
  variables: Array<{
    id: string;
    key: string;
    label: string;
    required: boolean;
  }>;
};

type BatchVariable = BatchTemplate["variables"][number];

type ParsedPerson = {
  values: Record<string, string>;
  extraValues: string[];
};

type PreviewRow = {
  line: number;
  values: Record<string, string>;
  errors: string[];
};

const steps = ["Dados", "Pessoas", "Revisão"];

export function BatchForm({ templates }: { templates: BatchTemplate[] }) {
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [company, setCompany] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [sharedValues, setSharedValues] = useState<Record<string, string>>({});
  const [sharedMonthValues, setSharedMonthValues] = useState<Record<string, string>>({});
  const [namesText, setNamesText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [includeDocumentField, setIncludeDocumentField] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [showTestInfo, setShowTestInfo] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const variables = useMemo(() => selectedTemplate?.variables ?? [], [selectedTemplate]);
  const allPersonVariables = useMemo(
    () => dedupeTemplateFieldVariables(variables.filter(isTemplateBatchPersonField)),
    [variables],
  );
  const hasDocumentChoice = useMemo(
    () => allPersonVariables.some((variable) => shouldUseDocumentChoice(variable, variables)),
    [allPersonVariables, variables],
  );
  const personVariables = useMemo(
    () => includeDocumentField
      ? allPersonVariables
      : allPersonVariables.filter((variable) => !shouldUseDocumentChoice(variable, variables)),
    [allPersonVariables, includeDocumentField, variables],
  );
  const recipientVariable = personVariables.find(isTemplateRecipientField) ?? null;
  const sharedVariables = useMemo(
    () =>
      dedupeTemplateFieldVariables(
        variables.filter(
          (variable) =>
            isTemplateBatchSharedField(variable) &&
            !isCompanyVariable(variable) &&
            !isDateField(variable),
        ),
      ),
    [variables],
  );

  const people = useMemo(
    () => splitPeople(namesText, personVariables),
    [namesText, personVariables],
  );
  const preview = useMemo(
    () =>
      buildPreviewRows({
        people,
        personVariables,
        company,
        issuedDate,
        sharedValues,
        sharedVariables,
      }),
    [people, personVariables, company, issuedDate, sharedValues, sharedVariables],
  );
  const sharedMissing = sharedVariables.filter(
    (variable) => isTemplateVariableRequired(variable) && !sharedValues[variable.key]?.trim(),
  );
  const batchBlockReason = getBatchBlockReason(recipientVariable, personVariables);
  const validRows = preview.filter((row) => !row.errors.length);
  const hasErrors =
    Boolean(batchBlockReason) ||
    preview.some((row) => row.errors.length) ||
    !company.trim() ||
    !issuedDate.trim() ||
    sharedMissing.length > 0;
  const canContinueFromData = Boolean(templateId && company.trim() && issuedDate.trim() && !sharedMissing.length && !batchBlockReason);
  const canContinueFromNames = people.length > 0 && !batchBlockReason;
  const canSubmit = !hasErrors && validRows.length > 0;

  function updateTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setStep(0);
    setMessage("");
    setNamesText("");
    setSharedValues({});
    setSharedMonthValues({});
    setIncludeDocumentField(true);
    setIsTest(false);
  }

  async function submit() {
    if (!canSubmit || loading) return;

    const form = new FormData();
    const formattedIssuedDate = formatDateLongPtBr(issuedDate);
    form.set("templateId", templateId);
    form.set("empresa", company.trim());
    form.set("data", formattedIssuedDate);
    form.set("recipientKey", recipientVariable?.key ?? "nome");
    form.set("personKeys", JSON.stringify(personVariables.map((variable) => variable.key)));
    form.set("peopleRows", JSON.stringify(preview.map((row) => row.values)));
    form.set("isTest", String(isTest));

    for (const variable of variables) {
      if (isCompanyVariable(variable)) {
        form.set(`values.${variable.key}`, company.trim());
      }

      if (isDateField(variable)) {
        form.set(`values.${variable.key}`, formattedIssuedDate);
      }
    }

    for (const variable of sharedVariables) {
      form.set(`values.${variable.key}`, sharedValues[variable.key]?.trim() ?? "");
    }

    setLoading(true);
    setMessage("");
    const response = await fetch("/api/certificates/batch", { method: "POST", body: form });
    const result = (await response.json()) as BatchResult;
    setLoading(false);

    if (!response.ok || !result.jobId) {
      setMessage(result.error ?? "Falha ao iniciar lote.");
      return;
    }

    notifyBatchJobStarted(result.jobId);
    setMessage(buildBatchResultMessage(result, validRows.length));
    setStep(0);
    setNamesText("");
  }

  return (
    <section className="dark-card-flat batch-form-card" style={{ padding: "1.25rem" }}>
      <div
        className="batch-step-tabs"
        style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
      >
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`batch-step-tab${step === index ? " batch-step-tab-active" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              minHeight: "2.45rem",
              border: `1px solid ${step === index ? "var(--brand-500)" : "var(--border-muted)"}`,
              borderRadius: "var(--radius-md)",
              background: step === index ? "var(--brand-50)" : "var(--surface-2)",
              color: step === index ? "var(--brand-700)" : "var(--text-secondary)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.875rem",
              fontWeight: 700,
              padding: "0.5rem 0.75rem",
              textAlign: "left",
            }}
          >
            <span
              className="batch-step-number"
              style={{
                display: "grid",
                width: 22,
                height: 22,
                placeItems: "center",
                flexShrink: 0,
                borderRadius: "50%",
                background: step === index ? "var(--brand-600)" : "var(--surface-3)",
                color: step === index ? "#fff" : "var(--text-muted)",
                fontSize: "0.75rem",
                fontWeight: 800,
              }}
            >
              {index + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        {step === 0 && (
          <div>
            <div
              className="batch-data-grid"
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                alignItems: "end",
              }}
            >
              <label className="field batch-field-model">
                <span className="field-label">Modelo</span>
                <select value={templateId} required onChange={(event) => updateTemplate(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Empresa</span>
                <small style={hintStyle}>Empresa vinculada ao lote; este valor será repetido em todos os certificados.</small>
                <input value={company} required onChange={(event) => setCompany(event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Data</span>
                <small style={hintStyle}>Data exibida no certificado; o sistema gravará o texto por extenso.</small>
                <input type="date" value={issuedDate} required onChange={(event) => setIssuedDate(event.target.value)} />
              </label>
              <div
                className="batch-test-field"
                style={{
                  display: "grid",
                  gap: "0.45rem",
                  minHeight: "5.25rem",
                  alignContent: "end",
                }}
              >
                <span className="field-label">Modo da emissão</span>
                <label
                  className="batch-test-toggle"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    minHeight: "2.5rem",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    padding: "0.6rem 0.75rem",
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                    fontWeight: 800,
                    lineHeight: 1.25,
                  }}
                >
                  <input
                    type="checkbox"
                    className="batch-test-checkbox"
                    style={{
                      width: 16,
                      height: 16,
                      minHeight: 16,
                      padding: 0,
                      flex: "0 0 auto",
                      accentColor: "var(--brand-600)",
                    }}
                    checked={isTest}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setIsTest(checked);
                      if (checked) setShowTestInfo(true);
                    }}
                  />
                  <span style={{ display: "grid", gap: "0.1rem" }}>
                    <span>Teste</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600 }}>
                      Não avança a numeração oficial
                    </span>
                  </span>
                </label>
              </div>
              {sharedVariables.map((variable) => (
                <label key={variable.id} className="field">
                  <span className="field-label">{getFieldLabel(variable)}</span>
                  <small style={hintStyle}>{getTemplateVariableDescription(variable)}</small>
                  {isPeriodField(variable) ? (
                    <input
                      type="month"
                      value={sharedMonthValues[variable.key] ?? ""}
                      required={isTemplateVariableRequired(variable)}
                      placeholder={getTemplateVariablePlaceholder(variable)}
                      onChange={(event) => {
                        const iso = event.target.value;
                        setSharedMonthValues((current) => ({
                          ...current,
                          [variable.key]: iso,
                        }));
                        setSharedValues((current) => ({
                          ...current,
                          [variable.key]: formatMonthYearPtBr(iso),
                        }));
                      }}
                    />
                  ) : (
                    <input
                      value={sharedValues[variable.key] ?? ""}
                      required={isTemplateVariableRequired(variable)}
                      placeholder={getTemplateVariablePlaceholder(variable)}
                      onChange={(event) =>
                        setSharedValues((current) => ({
                          ...current,
                          [variable.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            {batchBlockReason ? <WarningMessage>{batchBlockReason}</WarningMessage> : null}
            {sharedMissing.length > 0 ? (
              <WarningMessage>Preencha: {sharedMissing.map(getFieldLabel).join(", ")}.</WarningMessage>
            ) : null}
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "grid", gap: "1rem" }}>
            {hasDocumentChoice ? (
              <DocumentChoiceField
                enabled={includeDocumentField}
                onEnabledChange={setIncludeDocumentField}
              />
            ) : null}
            <label className="field">
              <span className="field-label">Pessoas</span>
              <small style={hintStyle}>
                {getPeopleInstructions(personVariables)}
              </small>
              <textarea
                value={namesText}
                onChange={(event) => setNamesText(event.target.value)}
                rows={10}
                placeholder={buildPeoplePlaceholder(personVariables)}
              />
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {people.length} pessoas informadas
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <SummaryItem label="Modelo" value={selectedTemplate?.name ?? "-"} />
              <SummaryItem label="Empresa" value={company || "-"} />
              <SummaryItem label="Data" value={issuedDate ? formatDateLongPtBr(issuedDate) : "-"} />
              <SummaryItem label="Modo" value={isTest ? "Teste" : "Oficial"} />
              <SummaryItem label="Válidos" value={`${validRows.length}/${preview.length}`} />
            </div>
            <div className="dark-card-flat table-scroll" style={{ marginTop: "1.25rem" }}>
              <table className="dark-table" style={{ minWidth: Math.max(680, 220 + personVariables.length * 140) }}>
                <thead>
                  <tr>
                    <th>Linha</th>
                    {personVariables.map((variable) => (
                      <th key={variable.key}>{getFieldLabel(variable)}</th>
                    ))}
                    <th>Empresa</th>
                    <th>Data</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={`${row.line}-${Object.values(row.values).join("|")}`}>
                      <td>{row.line}</td>
                      {personVariables.map((variable) => (
                        <td key={variable.key} style={getTemplateFieldMetadata(variable).kind === "recipient_name" ? { color: "var(--text-primary)", fontWeight: 500 } : undefined}>
                          {row.values[variable.key] || "-"}
                        </td>
                      ))}
                      <td>{company || "-"}</td>
                      <td>{issuedDate ? formatDateLongPtBr(issuedDate) : "-"}</td>
                      <td>
                        {row.errors.length ? (
                          <span className="chip chip-warning">{row.errors.join(", ")}</span>
                        ) : (
                          <span className="chip chip-success">
                            <CheckCircle2 style={{ width: 12, height: 12, marginRight: 3 }} />
                            Pronto
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!preview.length && (
                    <tr>
                      <td colSpan={personVariables.length + 4} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                        Informe as pessoas para revisar o lote.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {hasErrors ? <WarningMessage>Corrija os campos destacados antes de gerar os certificados.</WarningMessage> : null}
          </div>
        )}
      </div>

      <div className="batch-form-actions">
        <button type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))} className="btn btn-ghost" style={{ opacity: step === 0 ? 0.4 : 1 }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Voltar
        </button>
        {step < 2 ? (
          <button type="button" disabled={step === 0 ? !canContinueFromData : !canContinueFromNames} onClick={() => setStep((current) => Math.min(2, current + 1))} className="btn btn-primary">
            Continuar <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
        ) : (
          <button type="button" disabled={!canSubmit || loading} onClick={submit} className="btn btn-primary">
            {loading
              ? <><LoaderCircle style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> Gerando</>
              : <><Upload style={{ width: 15, height: 15 }} /> Gerar certificados</>
            }
          </button>
        )}
      </div>

      {message ? (
        <p style={{ marginTop: "1rem", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", padding: "0.625rem 0.875rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          {message}
        </p>
      ) : null}
      {showTestInfo ? <TestModeDialog onClose={() => setShowTestInfo(false)} /> : null}
    </section>
  );
}

const hintStyle = {
  fontSize: "0.78rem",
  lineHeight: 1.4,
  color: "var(--text-muted)",
} as const;

function WarningMessage({ children }: { children: ReactNode }) {
  return (
    <p style={{ marginTop: "0.75rem", borderRadius: "var(--radius-md)", background: "var(--warning-soft)", border: "1px solid color-mix(in oklch, var(--warning) 35%, transparent)", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "var(--warning)" }}>
      {children}
    </p>
  );
}

function DocumentChoiceField({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">CPF dos participantes</span>
      <small style={hintStyle}>
        Escolha se as linhas do lote terão CPF/documento para aparecer no certificado.
      </small>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, borderRadius: "var(--radius-md)", background: "var(--surface-2)", padding: 4 }}>
        <button
          type="button"
          onClick={() => onEnabledChange(true)}
          style={documentChoiceButtonStyle(enabled)}
        >
          Com CPF
        </button>
        <button
          type="button"
          onClick={() => onEnabledChange(false)}
          style={documentChoiceButtonStyle(!enabled)}
        >
          Sem CPF
        </button>
      </div>
    </div>
  );
}

function TestModeDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold text-slate-900">Modo teste ativado</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          O lote será gerado para conferência com códigos TESTE. Nenhum certificado do lote avança a sequência oficial TCS-BR.
        </p>
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Entendi
        </button>
      </div>
    </div>
  );
}

function documentChoiceButtonStyle(active: boolean) {
  return {
    border: `1px solid ${active ? "var(--brand-500)" : "var(--border-muted)"}`,
    borderRadius: "var(--radius-sm)",
    background: active ? "var(--brand-50)" : "var(--surface-1)",
    color: active ? "var(--brand-700)" : "var(--text-secondary)",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.875rem",
    fontWeight: 700,
    padding: "0.55rem 0.75rem",
  } as const;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "var(--surface-2)", padding: "0.625rem 0.875rem" }}>
      <p style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</p>
      <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>
    </div>
  );
}

function splitPeople(value: string, personVariables: BatchVariable[]): ParsedPerson[] {
  const rawLines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = dropHeaderLine(rawLines, personVariables);
  if (!personVariables.length) return [];

  if (personVariables.length === 1) {
    return lines
      .join("\n")
      .split(/\r?\n|;|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((name) => ({
        values: { [personVariables[0].key]: name },
        extraValues: [],
      }));
  }

  return lines.map((line) => parsePersonLine(line, personVariables));
}

function dropHeaderLine(lines: string[], personVariables: BatchVariable[]) {
  if (!lines.length || !looksLikePeopleHeader(lines[0], personVariables)) return lines;
  return lines.slice(1);
}

function looksLikePeopleHeader(line: string, personVariables: BatchVariable[]) {
  const separator = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
  const parts = line.split(separator).map(normalizeHeaderText).filter(Boolean);
  if (!parts.length) return false;

  const expected = personVariables.map((variable) => [
    normalizeHeaderText(variable.key),
    normalizeHeaderText(getFieldLabel(variable)),
  ]);

  return parts.every((part, index) => expected[index]?.includes(part));
}

function parsePersonLine(line: string, personVariables: BatchVariable[]): ParsedPerson {
  const separator = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
  const parts = line.split(separator).map((part) => part.trim());
  const values: Record<string, string> = {};

  for (const [index, variable] of personVariables.entries()) {
    values[variable.key] = formatTemplateFieldValue(variable, parts[index] ?? "");
  }

  return {
    values,
    extraValues: parts.slice(personVariables.length).filter(Boolean),
  };
}

function buildPreviewRows({
  people,
  personVariables,
  company,
  issuedDate,
  sharedValues,
  sharedVariables,
}: {
  people: ParsedPerson[];
  personVariables: BatchVariable[];
  company: string;
  issuedDate: string;
  sharedValues: Record<string, string>;
  sharedVariables: BatchVariable[];
}) {
  const seen = new Map<string, number>();

  return people.map<PreviewRow>((person, index) => {
    const errors: string[] = [];
    const line = index + 1;

    if (!company.trim()) errors.push("empresa vazia");
    if (!issuedDate.trim()) errors.push("data vazia");
    if (person.extraValues.length) errors.push("campos extras");

    for (const variable of sharedVariables) {
      if (isTemplateVariableRequired(variable) && !sharedValues[variable.key]?.trim()) {
        errors.push(`${getFieldLabel(variable)} vazio`);
      }
    }

    for (const variable of personVariables) {
      const value = person.values[variable.key]?.trim() ?? "";
      if (isTemplateVariableRequired(variable) && !value) {
        errors.push(`${getFieldLabel(variable)} vazio`);
      }

      const validationError = validateTemplateFieldValue(variable, value);
      if (validationError) {
        errors.push(`${getFieldLabel(variable)} inválido`);
      }

      const duplicateKey = getTemplateDuplicateKey(variable, value);
      if (duplicateKey) {
        const firstLine = seen.get(duplicateKey);
        if (firstLine) {
          errors.push(`${getFieldLabel(variable)} duplicado da linha ${firstLine}`);
        } else {
          seen.set(duplicateKey, line);
        }
      }
    }

    return {
      line,
      values: person.values,
      errors,
    };
  });
}

function getFieldLabel(variable: { key: string; label: string }) {
  return getTemplateVariableLabel(variable);
}

function isCompanyVariable(variable: { key: string; label: string }) {
  return getTemplateFieldMetadata(variable).kind === "company";
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

function getBatchBlockReason(
  recipientVariable: BatchVariable | null,
  personVariables: BatchVariable[],
) {
  if (!personVariables.length || !recipientVariable) {
    return "Este modelo precisa de um campo de aluno/nome para emitir em lote com segurança.";
  }

  return "";
}

function getPersonInputLabel(personVariables: BatchVariable[]) {
  return personVariables.map(getFieldLabel).join("; ") || "Nome";
}

function getPeopleInstructions(personVariables: BatchVariable[]) {
  if (personVariables.length <= 1) {
    return "Informe uma pessoa por linha.";
  }

  return `Informe uma pessoa por linha, separando por ponto e vírgula nesta ordem: ${getPersonInputLabel(personVariables)}.`;
}

function buildPeoplePlaceholder(personVariables: BatchVariable[]) {
  if (personVariables.length <= 1) {
    return "Maria Silva\nJoao Santos";
  }

  const header = getPersonInputLabel(personVariables);
  const exampleValues = personVariables.map((variable) => {
    const kind = getTemplateFieldMetadata(variable).kind;
    if (kind === "recipient_name") return "Maria Silva";
    if (kind === "cpf") return "123.456.789-00";
    if (kind === "rg") return "MG 12.345.678";
    if (kind === "uf") return "MG";
    if (kind === "email") return "maria@empresa.com";
    return getTemplateVariablePlaceholder(variable);
  });

  return `${header}\n${exampleValues.join("; ")}`;
}

function normalizeHeaderText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
