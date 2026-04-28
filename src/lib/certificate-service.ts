import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { renderDocxBuffer, renderPdfBuffer } from "@/lib/render-certificate";
import { uploadCertificateFile } from "@/lib/supabase";

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
    if (variable.required && !values[variable.key]) {
      throw new Error(`Variável obrigatória ausente: ${variable.label}`);
    }
  }

  const verificationCode = nanoid(12).toUpperCase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const recipientName = values.nome || values.name || "Sem nome";
  const recipientEmail = values.email || undefined;
  const recipientDocument = values.documento || values.cpf || undefined;

  const pdf = await renderPdfBuffer({ template, values, verificationCode, appUrl });
  const docx = await renderDocxBuffer({ template, values, verificationCode, appUrl });
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
      values,
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
