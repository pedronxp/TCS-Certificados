import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { readSheet, type CellValue } from "read-excel-file/node";
import { requireAdmin } from "@/lib/auth";
import { failStaleBatchJobs, getBatchJob, processBatchJobChunk, startBatchJob } from "@/lib/batch-jobs";
import { DATE_FIELD_KEYS } from "@/lib/date-fields";
import { prisma } from "@/lib/prisma";
import {
  formatTemplateFieldValue,
  getTemplateDuplicateKey,
  getTemplateFieldAliases,
  getTemplateVariableLabel,
  isTemplateBatchPersonField,
  isTemplateRecipientField,
  mirrorTemplateFieldValues,
  validateTemplateFieldValue,
} from "@/lib/template-variable-fields";
import { validateBatchRowCount, validateBatchSpreadsheetFile } from "@/lib/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const companyColumns = ["empresa", "company"];
const dateColumns = [...DATE_FIELD_KEYS];

type BatchRouteVariable = {
  key: string;
  label: string;
  required: boolean;
};

export async function POST(request: Request) {
  const user = await requireAdmin();
  const formData = await request.formData();
  const templateId = String(formData.get("templateId") ?? "");
  const file = formData.get("file");
  const hasUploadedFile = file instanceof File && file.size > 0 && Boolean(file.name);

  const template = await prisma.certificateTemplate.findUnique({
    where: { id: templateId },
    select: {
      variables: {
        select: { key: true, label: true, required: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Modelo nao encontrado." }, { status: 404 });
  }

  const supportError = validateTemplateBatchSupport(template.variables);
  if (supportError) {
    return NextResponse.json({ error: supportError }, { status: 400 });
  }

  if (hasUploadedFile) {
    const fileError = validateBatchSpreadsheetFile(file);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }
  }

  const parsedRows = hasUploadedFile ? await parseRows(file) : parseManualRows(formData);
  const rows = normalizeRowsForTemplate(parsedRows, template.variables);
  if (!rows.length) {
    return NextResponse.json({ error: "Informe os nomes ou envie uma planilha." }, { status: 400 });
  }

  const rowCountError = validateBatchRowCount(rows.length);
  if (rowCountError) {
    return NextResponse.json({ error: rowCountError }, { status: 400 });
  }

  const batchRuleError = validateSingleCompanyAndDate(rows);
  if (batchRuleError) {
    return NextResponse.json({ error: batchRuleError }, { status: 400 });
  }

  const templateRowsError = validateTemplateRows(rows, template.variables, hasUploadedFile ? 2 : 1);
  if (templateRowsError) {
    return NextResponse.json({ error: templateRowsError }, { status: 400 });
  }

  try {
    const job = await startBatchJob({ templateId, rows, issuedById: user.id, lineOffset: hasUploadedFile ? 2 : 1 });

    return NextResponse.json({
      jobId: job.id,
      total: job.total,
      processed: job.processed,
      created: job.created,
      errors: Array.isArray(job.errors) ? job.errors : [],
      status: job.status.toLowerCase(),
    }, { status: 201 });
  } catch (error) {
    console.error("Falha ao gerar lote", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerar lote." },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const user = await requireAdmin();
  const jobId = new URL(request.url).searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Informe o lote." }, { status: 400 });
  }

  await failStaleBatchJobs().catch((error) => {
    console.error("Falha ao encerrar lotes interrompidos", error);
  });

  let job = await getBatchJob(jobId, user.id);
  if (!job) {
    return NextResponse.json({ error: "Lote nao encontrado." }, { status: 404 });
  }

  if (job.status === "RUNNING") {
    job = (await processBatchJobChunk(job.id, user.id)) ?? job;
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
  const peopleRows = parsePeopleRows(formData);
  if (peopleRows) return peopleRows;

  const rawNames = String(formData.get("names") ?? "");
  const rawDocuments = String(formData.get("documents") ?? "");
  const empresa = String(formData.get("empresa") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const recipientKey = String(formData.get("recipientKey") ?? "nome").trim() || "nome";
  const documentKey = String(formData.get("documentKey") ?? "").trim();
  const sharedValues: Record<string, string> = { empresa, data };
  const people = parseManualPeople(rawNames, rawDocuments, Boolean(documentKey));

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("values.")) continue;

    const valueKey = key.slice("values.".length);
    if (valueKey) {
      sharedValues[valueKey] = String(value ?? "").trim();
    }
  }

  return people.map((person) => {
    const row = {
      ...sharedValues,
      [recipientKey]: person.name,
      nome: person.name,
    };

    if (documentKey) {
      row[documentKey] = person.document;
    }

    return row;
  });
}

function parsePeopleRows(formData: FormData) {
  const rawPeopleRows = formData.get("peopleRows");
  if (typeof rawPeopleRows !== "string" || !rawPeopleRows.trim()) return null;

  let peopleRows: unknown;
  try {
    peopleRows = JSON.parse(rawPeopleRows);
  } catch {
    return null;
  }

  if (!Array.isArray(peopleRows)) return null;

  const recipientKey = String(formData.get("recipientKey") ?? "nome").trim() || "nome";
  const sharedValues = readSharedValues(formData);

  return peopleRows
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const values: Record<string, string> = { ...sharedValues };

      for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
        values[key] = String(value ?? "").trim();
      }

      if (values[recipientKey]) {
        values.nome ??= values[recipientKey];
      }

      return values;
    })
    .filter((row): row is Record<string, string> => Boolean(row && Object.values(row).some((value) => value.trim())));
}

function readSharedValues(formData: FormData) {
  const sharedValues: Record<string, string> = {
    empresa: String(formData.get("empresa") ?? "").trim(),
    data: String(formData.get("data") ?? "").trim(),
  };

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("values.")) continue;

    const valueKey = key.slice("values.".length);
    if (valueKey) {
      sharedValues[valueKey] = String(value ?? "").trim();
    }
  }

  return sharedValues;
}

function parseManualPeople(namesValue: string, documentsValue: string, hasDocumentKey: boolean) {
  const documents = splitLineValues(documentsValue);

  if (!hasDocumentKey) {
    return splitNames(namesValue).map((name) => ({ name, document: "" }));
  }

  if (documents.some(Boolean)) {
    return splitLineValues(namesValue)
      .map((name, index) => ({ name: name.trim(), document: normalizeDocumentValue(documents[index] ?? "") }))
      .filter((person) => person.name || person.document);
  }

  return splitLineValues(namesValue)
    .map((line) => parsePersonLine(line))
    .filter((person) => person.name || person.document);
}

function parsePersonLine(line: string) {
  const value = line.trim();
  if (!value) return { name: "", document: "" };

  const separator = value.includes(";") ? ";" : value.includes("\t") ? "\t" : ",";
  const [name, ...documentParts] = value.split(separator);
  return {
    name: name.trim(),
    document: normalizeDocumentValue(documentParts.join(separator).trim()),
  };
}

function splitNames(value: string) {
  return value
    .split(/\r?\n|;|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function splitLineValues(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim());
}

function normalizeDocumentValue(value: string) {
  const digits = onlyDigits(value);
  if (digits.length === 11) return formatCpf(digits);
  if (digits.length === 14) return formatCnpj(digits);
  return value.trim();
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = value.slice(0, 11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function formatCnpj(value: string) {
  const digits = value.slice(0, 14);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
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

  const [headerRow = [], ...dataRows] = await readSheet(buffer);
  const headers = headerRow.map((value) => formatCellValue(value));

  return normalizeRows(
    dataRows
      .map((row) => rowToObject(headers, row))
      .filter((row) => Object.values(row).some((value) => String(value ?? "").trim())),
  );
}

function rowToObject(headers: string[], row: Array<CellValue | null>) {
  const data: Record<string, unknown> = {};

  for (const [index, header] of headers.entries()) {
    if (header) data[header] = row[index] ?? "";
  }

  return data;
}

function normalizeRowsForTemplate(
  rows: Record<string, string>[],
  variables: BatchRouteVariable[],
) {
  return rows.map((row) => {
    const normalizedRow = { ...row };

    for (const variable of variables) {
      const value = findValueForVariable(row, variable);
      if (value) {
        normalizedRow[variable.key] = formatTemplateFieldValue(variable, value);
      }
    }

    return mirrorTemplateFieldValues(variables, normalizedRow);
  });
}

function findValueForVariable(row: Record<string, string>, variable: BatchRouteVariable) {
  for (const alias of getTemplateFieldAliases(variable)) {
    const value = findColumnValue(row, alias);
    if (value.trim()) return value;
  }

  return "";
}

function findColumnValue(row: Record<string, string>, alias: string) {
  const normalizedAlias = normalizeHeader(alias);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeHeader(key) === normalizedAlias) {
      return String(value ?? "").trim();
    }
  }

  return "";
}

function validateTemplateBatchSupport(variables: BatchRouteVariable[]) {
  const personVariables = variables.filter(isTemplateBatchPersonField);
  if (!personVariables.length || !personVariables.some(isTemplateRecipientField)) {
    return "Este modelo precisa de um campo de aluno/nome para emissao em lote.";
  }

  return null;
}

function validateTemplateRows(
  rows: Record<string, string>[],
  variables: BatchRouteVariable[],
  lineOffset: number,
) {
  const seen = new Map<string, number>();

  for (const [index, row] of rows.entries()) {
    const line = index + lineOffset;

    for (const variable of variables) {
      const value = String(row[variable.key] ?? "").trim();
      const label = getTemplateVariableLabel(variable);

      if (variable.required && !value) {
        return `Linha ${line}: informe ${label}.`;
      }

      const validationError = validateTemplateFieldValue(variable, value);
      if (validationError) {
        return `Linha ${line}: ${label} invalido. ${validationError}`;
      }

      if (isTemplateBatchPersonField(variable)) {
        const duplicateKey = getTemplateDuplicateKey(variable, value);
        if (duplicateKey) {
          const firstLine = seen.get(duplicateKey);
          if (firstLine) {
            return `Linha ${line}: ${label} duplicado da linha ${firstLine}.`;
          }

          seen.set(duplicateKey, line);
        }
      }
    }
  }

  return null;
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
