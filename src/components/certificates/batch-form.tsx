"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Upload } from "lucide-react";
import { notifyBatchJobStarted } from "@/components/certificates/batch-progress-toast";
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

const steps = ["Dados", "Pessoas", "Revisao"];

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

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const variables = useMemo(() => selectedTemplate?.variables ?? [], [selectedTemplate]);
  const personVariables = useMemo(
    () => dedupeTemplateFieldVariables(variables.filter(isTemplateBatchPersonField)),
    [variables],
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
    (variable) => variable.required && !sharedValues[variable.key]?.trim(),
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
    setMessage(buildBatchMessage(result, validRows.length));
    setStep(0);
    setNamesText("");
  }

  return (
    <section className="dark-card-flat" style={{ padding: "1.25rem" }}>
      <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${step === index ? "var(--brand-500)" : "var(--border-muted)"}`,
              background: step === index ? "var(--brand-50)" : "var(--surface-2)",
              padding: "0.5rem 0.75rem",
              textAlign: "left",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: step === index ? "var(--brand-700)" : "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 150ms",
              fontFamily: "inherit",
            }}
          >
            <span
              style={{
                display: "grid",
                width: 22,
                height: 22,
                placeItems: "center",
                borderRadius: "50%",
                background: step === index ? "var(--brand-600)" : "var(--surface-3)",
                color: step === index ? "#fff" : "var(--text-muted)",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
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
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <label className="field">
                <span className="field-label">Modelo</span>
                <select value={templateId} required onChange={(event) => updateTemplate(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Empresa</span>
                <small style={hintStyle}>Empresa vinculada ao lote; este valor sera repetido em todos os certificados.</small>
                <input value={company} required onChange={(event) => setCompany(event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Data</span>
                <small style={hintStyle}>Data exibida no certificado; o sistema gravara o texto por extenso.</small>
                <input type="date" value={issuedDate} required onChange={(event) => setIssuedDate(event.target.value)} />
              </label>
              {sharedVariables.map((variable) => (
                <label key={variable.id} className="field">
                  <span className="field-label">{getFieldLabel(variable)}</span>
                  <small style={hintStyle}>{getTemplateVariableDescription(variable)}</small>
                  {isPeriodField(variable) ? (
                    <input
                      type="month"
                      value={sharedMonthValues[variable.key] ?? ""}
                      required={variable.required}
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
                      required={variable.required}
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
          <label className="field">
            <span className="field-label">Pessoas ({getPersonInputLabel(personVariables)})</span>
            <small style={hintStyle}>
              Informe uma pessoa por linha, separando os campos por ponto e virgula na ordem indicada.
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
        )}

        {step === 2 && (
          <div>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <SummaryItem label="Modelo" value={selectedTemplate?.name ?? "-"} />
              <SummaryItem label="Empresa" value={company || "-"} />
              <SummaryItem label="Data" value={issuedDate ? formatDateLongPtBr(issuedDate) : "-"} />
              <SummaryItem label="Validos" value={`${validRows.length}/${preview.length}`} />
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

      <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
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
    <p style={{ marginTop: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#d97706" }}>
      {children}
    </p>
  );
}

function buildBatchMessage(result: BatchResult, fallbackTotal: number) {
  const total = result.total ?? fallbackTotal;
  const created = result.created ?? 0;
  const errors = result.errors?.length ?? 0;

  if (result.status === "completed") {
    if (errors > 0) {
      return `Lote finalizado: ${created}/${total} gerados e ${errors} com erro.`;
    }

    return `Lote finalizado: ${created}/${total} certificados gerados.`;
  }

  if (result.status === "failed") {
    return result.errors?.[0] ?? "Lote falhou.";
  }

  return `Lote iniciado com ${total} certificados. Voce pode sair desta tela.`;
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
      if (variable.required && !sharedValues[variable.key]?.trim()) {
        errors.push(`${getFieldLabel(variable)} vazio`);
      }
    }

    for (const variable of personVariables) {
      const value = person.values[variable.key]?.trim() ?? "";
      if (variable.required && !value) {
        errors.push(`${getFieldLabel(variable)} vazio`);
      }

      const validationError = validateTemplateFieldValue(variable, value);
      if (validationError) {
        errors.push(`${getFieldLabel(variable)} invalido`);
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

function getBatchBlockReason(
  recipientVariable: BatchVariable | null,
  personVariables: BatchVariable[],
) {
  if (!personVariables.length || !recipientVariable) {
    return "Este modelo precisa de um campo de aluno/nome para emitir em lote com seguranca.";
  }

  return "";
}

function getPersonInputLabel(personVariables: BatchVariable[]) {
  return personVariables.map(getFieldLabel).join("; ") || "Nome";
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
