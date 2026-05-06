import { buildDefaultCertificateDeleteAt } from "@/lib/certificate-validity";
import { formatDateLongPtBr, isDateField } from "@/lib/date-fields";
import { prisma } from "@/lib/prisma";
import {
  DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE,
  renderDocxBuffer,
  renderPdfBuffer,
  type RenderInput,
} from "@/lib/render-certificate";
import { deleteCertificateFiles, uploadCertificateFile } from "@/lib/supabase";
import {
  buildVerificationTemplateValues,
  generateVerificationCode,
  isSystemCertificateVariableKey,
  parseVerificationSequence,
} from "@/lib/verification-code";

const CERTIFICATE_SEQUENCE_ID = "global";

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

  const issuedBy = await prisma.user.findUnique({
    where: { id: issuedById },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!issuedBy) throw new Error("Usuário emissor não encontrado.");

  const securedValues = applyIssuerRestrictions(values, template.variables, issuedBy);

  for (const variable of template.variables) {
    if (isSystemCertificateVariableKey(variable.key)) continue;

    if (variable.required && !String(securedValues[variable.key] ?? "").trim()) {
      throw new Error(`Variável obrigatória ausente: ${variable.label}`);
    }
  }

  const issuedAt = new Date();
  const verificationCode = await reserveNextVerificationCode(issuedAt);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const issueValues = { ...securedValues, ...buildVerificationTemplateValues(verificationCode) };
  const normalizedValues = normalizeIssueValues(normalizeDateValues(issueValues, template.variables));
  const recipientName = findValue(normalizedValues, ["nome", "name", "participante", "aluno", "titular"]) || "Sem nome";
  const recipientEmail = findValue(normalizedValues, ["email", "e_mail"]) || undefined;
  const recipientDocument = findDocumentValue(normalizedValues);

  const renderInput = { template, values: normalizedValues.original, verificationCode, appUrl };
  const docx = await renderDocxBuffer(renderInput);
  const pdf = await renderPdfBufferSafely(renderInput);
  const pdfFilename = `${recipientName}-${verificationCode}.pdf`;
  const docxFilename = buildDocxFilename(recipientName, template.name);
  const pdfMimeType = "application/pdf";
  const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const [pdfStoragePath, docxStoragePath] = await Promise.all([
    pdf
      ? uploadCertificateFileSafely({
          buffer: pdf,
          filename: pdfFilename,
          mimeType: pdfMimeType,
          verificationCode,
        })
      : null,
    uploadCertificateFileSafely({
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
      issuedAt,
      deleteAt: buildDefaultCertificateDeleteAt(issuedAt),
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
            content: pdf,
            storagePath: pdfStoragePath,
          },
          {
            type: "DOCX",
            filename: docxFilename,
            mimeType: docxMimeType,
            content: docx,
            storagePath: docxStoragePath,
          },
        ],
      },
    },
    include: { recipient: true, files: true },
  });
}

export async function renderCertificatePreviewPdf({
  templateId,
  values,
  issuedById,
}: {
  templateId: string;
  values: Record<string, string>;
  issuedById: string;
}) {
  const template = await prisma.certificateTemplate.findUnique({
    where: { id: templateId },
    include: { variables: true },
  });
  if (!template) throw new Error("Modelo não encontrado.");

  const issuedBy = await prisma.user.findUnique({
    where: { id: issuedById },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!issuedBy) throw new Error("Usuário emissor não encontrado.");

  const securedValues = applyIssuerRestrictions(values, template.variables, issuedBy);

  for (const variable of template.variables) {
    if (isSystemCertificateVariableKey(variable.key)) continue;

    if (variable.required && !String(securedValues[variable.key] ?? "").trim()) {
      throw new Error(`Variável obrigatória ausente: ${variable.label}`);
    }
  }

  const normalizedValues = normalizeIssueValues(normalizeDateValues(securedValues, template.variables));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const previewCode = "PREVIA";
  const pdf = await renderPdfBufferSafely({
    template,
    values: normalizedValues.original,
    verificationCode: previewCode,
    appUrl,
  });

  if (!pdf) throw new Error(DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE);
  return pdf;
}

export async function expireCertificateDocuments(ids: string[], now = new Date()) {
  return expireCertificateDocumentFiles(ids, { deleteAt: now });
}

async function reserveNextVerificationCode(issuedAt: Date) {
  const sequence = await prisma.certificateSequence.upsert({
    where: { id: CERTIFICATE_SEQUENCE_ID },
    update: { value: { increment: 1 } },
    create: {
      id: CERTIFICATE_SEQUENCE_ID,
      value: await findHighestExistingVerificationSequence() + 1,
    },
    select: { value: true },
  });

  return generateVerificationCode(sequence.value, issuedAt);
}

async function findHighestExistingVerificationSequence() {
  const existingIssues = await prisma.certificateIssue.findMany({
    where: { verificationCode: { startsWith: "TCS-BR-" } },
    select: { verificationCode: true },
  });

  return existingIssues.reduce((highestSequence, issue) => {
    const sequence = parseVerificationSequence(issue.verificationCode);
    return sequence && sequence > highestSequence ? sequence : highestSequence;
  }, 0);
}

async function renderPdfBufferSafely(input: RenderInput) {
  try {
    return await renderPdfBuffer(input);
  } catch (error) {
    if (error instanceof Error && error.message === DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE) {
      console.warn("PDF nao gerado; conversor DOCX para PDF indisponivel.", error.message);
      return null;
    }

    throw error;
  }
}

async function uploadCertificateFileSafely(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  verificationCode: string;
}) {
  try {
    return await uploadCertificateFile(input);
  } catch (error) {
    console.warn("Falha ao enviar arquivo ao storage; mantendo copia local no banco.", error);
    return null;
  }
}

export async function expireScheduledCertificateDocuments(now = new Date()) {
  const issues = await prisma.certificateIssue.findMany({
    where: {
      deleteAt: { lte: now },
    },
    select: { id: true },
  });

  return expireCertificateDocumentFiles(issues.map((issue) => issue.id));
}

async function expireCertificateDocumentFiles(
  ids: string[],
  options: { deleteAt?: Date } = {},
) {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (!uniqueIds.length) return 0;

  const issues = await prisma.certificateIssue.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      files: { select: { storagePath: true } },
    },
  });

  if (!issues.length) return 0;

  await removeStoredFiles(issues.flatMap((issue) => issue.files.map((file) => file.storagePath).filter(Boolean) as string[]));

  await prisma.generatedFile.updateMany({
    where: { issueId: { in: issues.map((issue) => issue.id) } },
    data: {
      content: null,
      storagePath: null,
    },
  });

  if (options.deleteAt) {
    await prisma.certificateIssue.updateMany({
      where: { id: { in: issues.map((issue) => issue.id) } },
      data: { deleteAt: options.deleteAt },
    });
  }

  return issues.length;
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

function applyIssuerRestrictions(
  values: Record<string, string>,
  variables: Array<{ key: string; label: string }>,
  issuedBy: { name: string; email: string; role: string },
) {
  if (issuedBy.role === "ADMIN") return values;

  const secured = { ...values };
  for (const variable of variables) {
    const field = normalizeKey(`${variable.key}_${variable.label}`);
    if (
      field.includes("nome") ||
      field.includes("name") ||
      field.includes("participante") ||
      field.includes("aluno") ||
      field.includes("titular")
    ) {
      secured[variable.key] = issuedBy.name;
      continue;
    }

    if (field.includes("email") || field.includes("e_mail")) {
      secured[variable.key] = issuedBy.email;
    }
  }

  return secured;
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
    "doc",
    "id",
    "rg",
    "identidade",
  ]);

  if (directDocument) return directDocument;

  for (const [key, value] of Object.entries(values.normalized)) {
    const keyTokens = key.split("_").filter(Boolean);
    if (
      value &&
      (keyTokens.includes("cpf") ||
        keyTokens.includes("cnpj") ||
        keyTokens.includes("documento") ||
        keyTokens.includes("document") ||
        keyTokens.includes("doc") ||
        keyTokens.includes("rg") ||
        key === "id" ||
        keyTokens.includes("identidade"))
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

function buildDocxFilename(recipientName: string, templateName: string) {
  return `${sanitizeFilenamePart(recipientName)}-${sanitizeFilenamePart(templateName)}.docx`;
}

function sanitizeFilenamePart(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "certificado"
  );
}
