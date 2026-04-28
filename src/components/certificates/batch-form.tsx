"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Upload } from "lucide-react";
import { notifyBatchJobStarted } from "@/components/certificates/batch-progress-toast";

type BatchResult = {
  jobId?: string;
  total?: number;
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
  errors: string[];
};

const recipientKeys = new Set(["nome", "name", "participante", "aluno", "titular"]);
const commonKeys = new Set(["empresa", "company", "data", "date", "data_emissao", "data_de_emissao", "emissao"]);
const steps = ["Dados", "Nomes", "Revisao"];

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
    selectedTemplate?.variables.find((variable) => recipientKeys.has(variable.key.toLowerCase()))?.key ?? "nome";
  const sharedVariables =
    selectedTemplate?.variables.filter(
      (variable) => !recipientKeys.has(variable.key.toLowerCase()) && !commonKeys.has(variable.key.toLowerCase()),
    ) ?? [];

  const names = useMemo(() => splitNames(namesText), [namesText]);
  const preview = useMemo(
    () => buildPreviewRows({ names, company, issuedDate }),
    [names, company, issuedDate],
  );
  const sharedMissing = sharedVariables.filter(
    (variable) => variable.required && !sharedValues[variable.key]?.trim(),
  );
  const validRows = preview.filter((row) => !row.errors.length);
  const hasErrors = preview.some((row) => row.errors.length) || !company.trim() || !issuedDate.trim() || sharedMissing.length > 0;
  const canContinueFromData = Boolean(templateId && company.trim() && issuedDate.trim() && !sharedMissing.length);
  const canContinueFromNames = names.length > 0;
  const canSubmit = !hasErrors && validRows.length > 0;

  async function submit() {
    if (!canSubmit || loading) return;

    const form = new FormData();
    form.set("templateId", templateId);
    form.set("empresa", company.trim());
    form.set("data", issuedDate.trim());
    form.set("recipientKey", recipientKey);
    form.set("names", names.join("\n"));

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
    setMessage(`Lote iniciado com ${result.total ?? validRows.length} certificados. Voce pode sair desta tela.`);
    setStep(0);
    setNamesText("");
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-semibold ${
              step === index
                ? "border-teal-700 bg-teal-50 text-teal-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="grid size-6 place-items-center rounded-full bg-white text-xs">{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {step === 0 ? (
          <div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="field">
                <span>Modelo</span>
                <select value={templateId} required onChange={(event) => setTemplateId(event.target.value)}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Empresa</span>
                <input value={company} required onChange={(event) => setCompany(event.target.value)} />
              </label>
              <label className="field">
                <span>Data</span>
                <input value={issuedDate} required onChange={(event) => setIssuedDate(event.target.value)} />
              </label>
              {sharedVariables.map((variable) => (
                <label key={variable.id} className="field">
                  <span>{variable.label}</span>
                  <input
                    value={sharedValues[variable.key] ?? ""}
                    required={variable.required}
                    placeholder={`{{${variable.key}}}`}
                    onChange={(event) =>
                      setSharedValues((current) => ({ ...current, [variable.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            {sharedMissing.length ? (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Preencha: {sharedMissing.map((variable) => variable.label).join(", ")}.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 1 ? (
          <label className="field">
            <span>Nomes</span>
            <textarea
              value={namesText}
              onChange={(event) => setNamesText(event.target.value)}
              rows={10}
              placeholder={"Cole um nome por linha\nMaria Silva\nJoao Santos\nAna Costa"}
            />
            <span className="text-xs font-medium text-slate-500">{names.length} nomes informados</span>
          </label>
        ) : null}

        {step === 2 ? (
          <div>
            <div className="grid gap-3 sm:grid-cols-4">
              <SummaryItem label="Modelo" value={selectedTemplate?.name ?? "-"} />
              <SummaryItem label="Empresa" value={company || "-"} />
              <SummaryItem label="Data" value={issuedDate || "-"} />
              <SummaryItem label="Validos" value={`${validRows.length}/${preview.length}`} />
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Linha</th>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.map((row) => (
                      <tr key={`${row.line}-${row.name}`}>
                        <td className="px-4 py-3">{row.line}</td>
                        <td className="px-4 py-3 font-medium">{row.name || "-"}</td>
                        <td className="px-4 py-3">{company || "-"}</td>
                        <td className="px-4 py-3">{issuedDate || "-"}</td>
                        <td className="px-4 py-3">
                          {row.errors.length ? (
                            <span className="font-semibold text-amber-700">{row.errors.join(", ")}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-teal-700">
                              <CheckCircle2 className="size-4" />
                              Pronto
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!preview.length ? (
                      <tr>
                        <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                          Informe os nomes para revisar o lote.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {hasErrors ? (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Corrija os campos destacados antes de gerar os certificados.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowLeft className="size-4" />
          Voltar
        </button>
        {step < 2 ? (
          <button
            type="button"
            disabled={step === 0 ? !canContinueFromData : !canContinueFromNames}
            onClick={() => setStep((current) => Math.min(2, current + 1))}
            className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            Continuar
            <ArrowRight className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSubmit || loading}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {loading ? "Iniciando" : "Gerar certificados"}
          </button>
        )}
      </div>

      {message ? <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium">{message}</p> : null}
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function splitNames(value: string) {
  return value
    .split(/\r?\n|;/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function buildPreviewRows({
  names,
  company,
  issuedDate,
}: {
  names: string[];
  company: string;
  issuedDate: string;
}) {
  const seen = new Map<string, number>();

  return names.map<PreviewRow>((name, index) => {
    const errors: string[] = [];
    const normalizedName = normalizeValue(name);

    if (!name.trim()) errors.push("nome vazio");
    if (!company.trim()) errors.push("empresa vazia");
    if (!issuedDate.trim()) errors.push("data vazia");

    const firstLine = seen.get(normalizedName);
    if (firstLine) {
      errors.push(`duplicado da linha ${firstLine}`);
    } else {
      seen.set(normalizedName, index + 1);
    }

    return { line: index + 1, name, errors };
  });
}

function normalizeValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
