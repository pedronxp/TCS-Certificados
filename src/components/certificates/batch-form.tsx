"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Upload } from "lucide-react";
import { notifyBatchJobStarted } from "@/components/certificates/batch-progress-toast";
import { formatDateLongPtBr, isDateField, normalizeFieldKey } from "@/lib/date-fields";

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

type PreviewRow = {
  line: number;
  name: string;
  document: string;
  documentDigits: string;
  errors: string[];
};

const recipientKeys = new Set(["nome", "name", "participante", "aluno", "titular"]);
const companyKeys = new Set(["empresa", "company"]);
const steps = ["Dados", "Pessoas", "Revisao"];

export function BatchForm({ templates }: { templates: BatchTemplate[] }) {
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [company, setCompany] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [sharedValues, setSharedValues] = useState<Record<string, string>>({});
  const [namesText, setNamesText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );
  const recipientKey =
    selectedTemplate?.variables.find((variable) => recipientKeys.has(normalizeFieldKey(variable.key)))?.key ?? "nome";
  const documentVariable = selectedTemplate?.variables.find((variable) => getDocumentMode(variable)) ?? null;
  const sharedVariables =
    selectedTemplate?.variables.filter(
      (variable) =>
        !recipientKeys.has(normalizeFieldKey(variable.key)) &&
        !companyKeys.has(normalizeFieldKey(variable.key)) &&
        !getDocumentMode(variable) &&
        !isDateField(variable),
    ) ?? [];

  const people = useMemo(() => splitPeople(namesText, Boolean(documentVariable)), [namesText, documentVariable]);
  const preview = useMemo(
    () => buildPreviewRows({ people, company, issuedDate, documentVariable }),
    [people, company, issuedDate, documentVariable],
  );
  const sharedMissing = sharedVariables.filter(
    (variable) => variable.required && !sharedValues[variable.key]?.trim(),
  );
  const validRows = preview.filter((row) => !row.errors.length);
  const hasErrors = preview.some((row) => row.errors.length) || !company.trim() || !issuedDate.trim() || sharedMissing.length > 0;
  const canContinueFromData = Boolean(templateId && company.trim() && issuedDate.trim() && !sharedMissing.length);
  const canContinueFromNames = people.length > 0;
  const canSubmit = !hasErrors && validRows.length > 0;

  async function submit() {
    if (!canSubmit || loading) return;

    const form = new FormData();
    const formattedIssuedDate = formatDateLongPtBr(issuedDate);
    form.set("templateId", templateId);
    form.set("empresa", company.trim());
    form.set("data", formattedIssuedDate);
    form.set("recipientKey", recipientKey);
    form.set("names", preview.map((row) => row.name).join("\n"));

    if (documentVariable) {
      form.set("documentKey", documentVariable.key);
      form.set("documents", preview.map((row) => row.document).join("\n"));
    }

    for (const variable of selectedTemplate?.variables ?? []) {
      if (companyKeys.has(normalizeFieldKey(variable.key))) {
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
      {/* Step tabs */}
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
                <select value={templateId} required onChange={(e) => setTemplateId(e.target.value)}>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Empresa</span>
                <input value={company} required onChange={(e) => setCompany(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Data</span>
                <input type="date" value={issuedDate} required onChange={(e) => setIssuedDate(e.target.value)} />
              </label>
              {sharedVariables.map((variable) => (
                <label key={variable.id} className="field">
                  <span className="field-label">{variable.label}</span>
                  <input
                    value={sharedValues[variable.key] ?? ""}
                    required={variable.required}
                    placeholder={`{{${variable.key}}}`}
                    onChange={(e) => setSharedValues((cur) => ({ ...cur, [variable.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            {sharedMissing.length > 0 && (
              <p style={{ marginTop: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#d97706" }}>
                Preencha: {sharedMissing.map((v) => v.label).join(", ")}.
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <label className="field">
            <span className="field-label">
              {documentVariable ? `Pessoas (${getPersonInputLabel(documentVariable)})` : "Nomes"}
            </span>
            <textarea
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              rows={10}
              placeholder={documentVariable ? "Nome; CPF\nMaria Silva; 123.456.789-00" : "Cole um nome por linha\nMaria Silva\nJoao Santos"}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{people.length} pessoas informadas</span>
          </label>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <SummaryItem label="Modelo" value={selectedTemplate?.name ?? "-"} />
              <SummaryItem label="Empresa" value={company || "-"} />
              <SummaryItem label="Data" value={issuedDate || "-"} />
              <SummaryItem label="Válidos" value={`${validRows.length}/${preview.length}`} />
            </div>
            <div className="dark-card-flat table-scroll" style={{ marginTop: "1.25rem" }}>
              <table className="dark-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Nome</th>
                    {documentVariable && <th>{getFieldLabel(documentVariable)}</th>}
                    <th>Empresa</th>
                    <th>Data</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={`${row.line}-${row.name}`}>
                      <td>{row.line}</td>
                      <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{row.name || "-"}</td>
                      {documentVariable && <td>{row.document || "-"}</td>}
                      <td>{company || "-"}</td>
                      <td>{formatDateLongPtBr(issuedDate) || "-"}</td>
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
                      <td colSpan={documentVariable ? 6 : 5} style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
                        Informe as pessoas para revisar o lote.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {hasErrors && (
              <p style={{ marginTop: "0.75rem", borderRadius: "var(--radius-md)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", padding: "0.5rem 0.75rem", fontSize: "0.875rem", fontWeight: 500, color: "#d97706" }}>
                Corrija os campos destacados antes de gerar os certificados.
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: "1.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
        <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="btn btn-ghost" style={{ opacity: step === 0 ? 0.4 : 1 }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Voltar
        </button>
        {step < 2 ? (
          <button type="button" disabled={step === 0 ? !canContinueFromData : !canContinueFromNames} onClick={() => setStep((s) => Math.min(2, s + 1))} className="btn btn-primary">
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

      {message && (
        <p style={{ marginTop: "1rem", borderRadius: "var(--radius-md)", background: "var(--surface-2)", border: "1px solid var(--border-subtle)", padding: "0.625rem 0.875rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          {message}
        </p>
      )}
    </section>
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

function splitPeople(value: string, hasDocumentField: boolean) {
  if (!hasDocumentField) {
    return value.split(/\r?\n|;/).map((name) => ({ name: name.trim(), document: "" })).filter((p) => p.name);
  }
  return value.split(/\r?\n/).map((line) => parsePersonLine(line)).filter((p) => p.name || p.document);
}

function parsePersonLine(line: string) {
  const value = line.trim();
  if (!value) return { name: "", document: "" };
  const separator = value.includes(";") ? ";" : value.includes("\t") ? "\t" : ",";
  const [name, ...documentParts] = value.split(separator);
  return { name: name.trim(), document: normalizeDocumentForDisplay(documentParts.join(separator).trim()) };
}

function buildPreviewRows({ people, company, issuedDate, documentVariable }: { people: Array<{ name: string; document: string }>; company: string; issuedDate: string; documentVariable: BatchTemplate["variables"][number] | null; }) {
  const seen = new Map<string, number>();
  const seenDocuments = new Map<string, number>();
  return people.map<PreviewRow>((person, index) => {
    const errors: string[] = [];
    const name = person.name.trim();
    const document = person.document.trim();
    const documentDigits = onlyDigits(document);
    const normalizedName = normalizeValue(name);
    const documentState = documentVariable ? getDocumentState(documentVariable, document) : null;
    if (!name.trim()) errors.push("nome vazio");
    if (!company.trim()) errors.push("empresa vazia");
    if (!issuedDate.trim()) errors.push("data vazia");
    if (documentVariable?.required && !documentDigits) errors.push(`${getFieldLabel(documentVariable)} vazio`);
    if (documentState && documentState.digits.length > 0 && !documentState.complete) errors.push(`${documentState.label} deve ter ${documentState.expectedLength} digitos`);
    if (normalizedName) {
      const firstLine = seen.get(normalizedName);
      if (firstLine) { errors.push(`nome duplicado da linha ${firstLine}`); } else { seen.set(normalizedName, index + 1); }
    }
    if (documentDigits && documentVariable) {
      const firstDocumentLine = seenDocuments.get(documentDigits);
      if (firstDocumentLine) { errors.push(`${getFieldLabel(documentVariable)} duplicado da linha ${firstDocumentLine}`); } else { seenDocuments.set(documentDigits, index + 1); }
    }
    return { line: index + 1, name, document, documentDigits, errors };
  });
}

function normalizeValue(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

type DocumentMode = "CPF" | "CNPJ" | "CPF_CNPJ";

function getFieldLabel(variable: { key: string; label: string }) {
  const normalizedLabel = normalizeFieldKey(variable.label);
  if (normalizedLabel === "cpf") return "CPF";
  if (normalizedLabel === "cnpj") return "CNPJ";
  return variable.label;
}

function getPersonInputLabel(variable: { key: string; label: string }) {
  return `Nome; ${getFieldLabel(variable)}`;
}

function getDocumentMode(variable: { key: string; label: string }): DocumentMode | null {
  const key = normalizeFieldKey(variable.key);
  const label = normalizeFieldKey(variable.label);
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
  return { digits, label: inferredType, expectedLength, complete: digits.length === expectedLength };
}

function inferDocumentType(mode: DocumentMode, digits: string) {
  if (mode === "CPF") return "CPF";
  if (mode === "CNPJ") return "CNPJ";
  return digits.length > 11 ? "CNPJ" : "CPF";
}

function normalizeDocumentForDisplay(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return value.trim();
}

function onlyDigits(value: string) { return value.replace(/\D/g, ""); }

function formatCpf(value: string) {
  const d = value.slice(0, 11);
  return [d.slice(0,3), d.slice(3,6), d.slice(6,9)].filter(Boolean).join(".") + (d.slice(9,11) ? `-${d.slice(9,11)}` : "");
}

function formatCnpj(value: string) {
  const d = value.slice(0, 14);
  let f = d.slice(0,2);
  if (d.slice(2,5)) f += `.${d.slice(2,5)}`;
  if (d.slice(5,8)) f += `.${d.slice(5,8)}`;
  if (d.slice(8,12)) f += `/${d.slice(8,12)}`;
  if (d.slice(12,14)) f += `-${d.slice(12,14)}`;
  return f;
}
