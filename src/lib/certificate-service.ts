import { nanoid } from "nanoid";
import { formatDateLongPtBr, isDateField } from "@/lib/date-fields";
import { prisma } from "@/lib/prisma";
import { renderDocxBuffer, renderPdfBuffer } from "@/lib/render-certificate";
import { deleteCertificateFiles, uploadCertificateFile } from "@/lib/supabase";

export async function issueCertificate({
  templateId,
  values,
  issuedById,
  batchId,
}: {
  templateId: string;
  values: Record<string, string>;
  issuedById: string;
  batchId?: string;
}) {
  const template = await prisma.certificateTemplate.findUnique({
    where: { id: templateId },
    include: { variables: true },
  });
  if (!template) throw new Error("Modelo não encontrado.");

  for (const variable of template.variables) {
    if (variable.required && !String(values[variable.key] ?? "").trim()) {
      throw new Error(`Variável obrigatória ausente: ${variable.label}`);
    }
  }

  const verificationCode = nanoid(12).toUpperCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const normalizedValues = normalizeIssueValues(normalizeDateValues(values, template.variables));
  const recipientName = findValue(normalizedValues, ["nome", "name", "participante", "aluno", "titular"]) || "Sem nome";
  const recipientEmail = findValue(normalizedValues, ["email", "e_mail"]) || undefined;
  const recipientDocument = findDocumentValue(normalizedValues);

  const pdf = await renderPdfBuffer({ template, values: normalizedValues.original, verificationCode, appUrl });
  const docx = await renderDocxBuffer({ template, values: normalizedValues.original, verificationCode, appUrl });
  const pdfFilename = `${recipientName}-${verificationCode}.pdf`;
  const docxFilename = `${recipientName}-${verificationCode}.docx`;
  const pdfMimeType = "application/pdf";
  const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const [pdfStoragePath, docxStoragePath] = await Promise.all([
    uploadCertificateFile({
      buffer: pdf,
      filename: pdfFilename,
      mimeType: pdfMimeType,
      verificationCode,
    }),
    uploadCertificateFile({
      buffer: docx,
      filename: docxFilename,
      mimeType: docxMimeType,
      verificationCode,
    }),
  ]);

  return prisma.certificateIssue.create({
    data: {
      verificationCode,
      values: normalizedValues.original,
      template: { connect: { id: templateId } },
      issuedBy: { connect: { id: issuedById } },
      ...(batchId ? { batch: { connect: { id: batchId } } } : {}),
      recipient: {
        create: {
          name: recipientName,
          email: recipientEmail,
          document: recipientDocument,
        },
      },
      files: {
        create: [
          {
            type: "PDF",
            filename: pdfFilename,
            mimeType: pdfMimeType,
            content: pdfStoragePath ? undefined : pdf,
            storagePath: pdfStoragePath,
          },
          {
            type: "DOCX",
            filename: docxFilename,
            mimeType: docxMimeType,
            content: docxStoragePath ? undefined : docx,
            storagePath: docxStoragePath,
          },
        ],
      },
    },
    include: { recipient: true, files: true },
  });
}

export async function deleteCertificateIssue(id: string) {
  return (await deleteCertificateIssues([id])) > 0;
}

export async function deleteCertificateIssues(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (!uniqueIds.length) return 0;

  const issues = await prisma.certificateIssue.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      recipientId: true,
      files: { select: { storagePath: true } },
    },
  });

  if (!issues.length) return 0;

  await prisma.certificateIssue.deleteMany({
    where: { id: { in: issues.map((issue) => issue.id) } },
  });

  const recipientIds = Array.from(new Set(issues.map((issue) => issue.recipientId)));
  await prisma.certificateRecipient.deleteMany({
    where: {
      id: { in: recipientIds },
      issues: { none: {} },
    },
  });

  await removeStoredFiles(issues.flatMap((issue) => issue.files.map((file) => file.storagePath).filter(Boolean) as string[]));
  return issues.length;
}

export async function deleteExpiredCertificateIssues(now = new Date()) {
  const issues = await prisma.certificateIssue.findMany({
    where: {
      deleteAt: { lte: now },
    },
    select: { id: true },
  });

  return deleteCertificateIssues(issues.map((issue) => issue.id));
}

async function removeStoredFiles(storagePaths: string[]) {
  try {
    await deleteCertificateFiles(storagePaths);
  } catch (error) {
    console.error("Falha ao remover arquivos armazenados do certificado", error);
  }
}

type NormalizedIssueValues = {
  original: Record<string, string>;
  normalized: Record<string, string>;
};

function normalizeIssueValues(values: Record<string, string>): NormalizedIssueValues {
  const original: Record<string, string> = {};
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    const stringValue = String(value ?? "").trim();
    original[key] = stringValue;
    normalized[normalizeKey(key)] = stringValue;
  }

  return { original, normalized };
}

function normalizeDateValues(
  values: Record<string, string>,
  variables: Array<{ key: string; label: string }>,
) {
  const normalized = { ...values };

  for (const variable of variables) {
    if (!isDateField(variable)) continue;

    const value = values[variable.key];
    if (value) normalized[variable.key] = formatDateLongPtBr(value);
  }

  return normalized;
}

function findValue(values: NormalizedIssueValues, aliases: string[]) {
  for (const alias of aliases) {
    const value = values.normalized[normalizeKey(alias)];
    if (value) return value;
  }

  return "";
}

function findDocumentValue(values: NormalizedIssueValues) {
  const directDocument = findValue(values, [
    "documento",
    "document",
    "cpf",
    "cnpj",
    "cpf_cnpj",
    "cpf_ou_cnpj",
    "documento_cpf_cnpj",
  ]);

  if (directDocument) return directDocument;

  for (const [key, value] of Object.entries(values.normalized)) {
    if (
      value &&
      (key.includes("cpf") || key.includes("cnpj") || key.includes("documento") || key.includes("document"))
    ) {
      return value;
    }
  }

  return undefined;
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
