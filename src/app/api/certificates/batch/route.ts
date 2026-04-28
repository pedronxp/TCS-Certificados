import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth";
import { getBatchJob, startBatchJob } from "@/lib/batch-jobs";

const companyColumns = ["empresa", "company"];
const dateColumns = ["data", "date", "data_emissao", "data_de_emissao", "emissao"];

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const templateId = String(formData.get("templateId") ?? "");
  const file = formData.get("file");
  const hasUploadedFile = file instanceof File && file.size > 0 && Boolean(file.name);

  const rows = hasUploadedFile ? await parseRows(file) : parseManualRows(formData);
  if (!rows.length) {
    return NextResponse.json({ error: "Informe os nomes ou envie uma planilha." }, { status: 400 });
  }

  const batchRuleError = validateSingleCompanyAndDate(rows);
  if (batchRuleError) {
    return NextResponse.json({ error: batchRuleError }, { status: 400 });
  }

  const job = await startBatchJob({ templateId, rows, issuedById: user.id, lineOffset: hasUploadedFile ? 2 : 1 });

  return NextResponse.json({ jobId: job.id, total: job.total, status: job.status.toLowerCase() }, { status: 202 });
}

export async function GET(request: Request) {
  const user = await requireUser();
  const jobId = new URL(request.url).searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Informe o lote." }, { status: 400 });
  }

  const job = await getBatchJob(jobId, user.id);
  if (!job) {
    return NextResponse.json({ error: "Lote nao encontrado." }, { status: 404 });
  }

  const progress = job.total ? Math.round((job.processed / job.total) * 100) : 0;
  return NextResponse.json({
    id: job.id,
    status: job.status.toLowerCase(),
    total: job.total,
    processed: job.processed,
    created: job.created,
    errors: Array.isArray(job.errors) ? job.errors : [],
    progress,
    templateName: job.template.name,
  });
}

function parseManualRows(formData: FormData) {
  const names = splitNames(String(formData.get("names") ?? ""));
  const empresa = String(formData.get("empresa") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const recipientKey = String(formData.get("recipientKey") ?? "nome").trim() || "nome";
  const sharedValues: Record<string, string> = { empresa, data };

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("values.")) continue;

    const valueKey = key.slice("values.".length);
    if (valueKey) {
      sharedValues[valueKey] = String(value ?? "").trim();
    }
  }

  return names.map((name) => ({
    ...sharedValues,
    [recipientKey]: name,
    nome: name,
  }));
}

function splitNames(value: string) {
  return value
    .split(/\r?\n|;|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

async function parseRows(file: File): Promise<Record<string, string>[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return normalizeRows(parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }));
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return normalizeRows(XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" }));
}

function validateSingleCompanyAndDate(rows: Record<string, string>[]) {
  const companyColumn = findColumn(rows, companyColumns);
  const dateColumn = findColumn(rows, dateColumns);

  if (!companyColumn) {
    return 'Inclua uma coluna "empresa" na planilha para emissao em lote.';
  }

  if (!dateColumn) {
    return 'Inclua uma coluna "data" na planilha para emissao em lote.';
  }

  const firstCompany = normalizeComparableValue(rows[0][companyColumn]);
  const firstDate = normalizeComparableValue(rows[0][dateColumn]);

  if (!firstCompany) {
    return "Linha 2: informe a empresa.";
  }

  if (!firstDate) {
    return "Linha 2: informe a data.";
  }

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const company = normalizeComparableValue(row[companyColumn]);
    const date = normalizeComparableValue(row[dateColumn]);

    if (!company) {
      return `Linha ${line}: informe a empresa.`;
    }

    if (!date) {
      return `Linha ${line}: informe a data.`;
    }

    if (company !== firstCompany) {
      return `Linha ${line}: a empresa deve ser igual em todo o lote.`;
    }

    if (date !== firstDate) {
      return `Linha ${line}: a data deve ser igual em todo o lote.`;
    }
  }

  return null;
}

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => {
    const normalizedRow: Record<string, string> = {};

    for (const [key, value] of Object.entries(row)) {
      const stringValue = formatCellValue(value);
      normalizedRow[key] = stringValue;
      normalizedRow[normalizeHeader(key)] ??= stringValue;
    }

    return normalizedRow;
  });
}

function findColumn(rows: Record<string, string>[], aliases: string[]) {
  const headers = Object.keys(rows[0] ?? {});
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.find((header) => normalizedAliases.has(normalizeHeader(header)));
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeComparableValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatCellValue(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? "").trim();
}
