import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import {
  certificateFileExtension,
  certificateFileMimeType,
  isOfficeBaseLayout,
  normalizeCertificateFileType,
  type CertificateFileType,
} from "@/lib/certificate-output-format";
import { prisma } from "@/lib/prisma";
import {
  DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE,
  renderDocxBuffer,
  renderPdfBuffer,
  renderPptxBuffer,
} from "@/lib/render-certificate";
import { downloadCertificateFile } from "@/lib/supabase";

const STALE_OFFICE_PDF_MAX_BYTES = 12_000;
const PDF_CONVERTER_UNAVAILABLE_USER_MESSAGE =
  "Nao foi possivel gerar o PDF deste certificado agora. Baixe o arquivo nativo do modelo enquanto a conversao para PDF e configurada no servidor.";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; type: string }> },
) {
  const user = await requireUser();
  await expireScheduledCertificateDocuments().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const { id, type } = await context.params;
  const fileType = normalizeCertificateFileType(type);
  const issue = await findIssueForDownload(id, fileType);

  if (!issue) return NextResponse.json({ error: "Arquivo nao encontrado." }, { status: 404 });
  if (user.role !== "ADMIN" && issue.issuedById !== user.id) {
    return NextResponse.json({ error: "Arquivo nao encontrado." }, { status: 404 });
  }
  if (isCertificateDocumentExpired(issue.deleteAt)) {
    return NextResponse.json(
      {
        error: "Documento expirado. O codigo de validacao continua ativo, mas o arquivo nao esta mais disponivel.",
        code: "CERTIFICATE_DOCUMENT_EXPIRED",
      },
      { status: 410 },
    );
  }

  const existingFile = issue.files[0] ?? null;
  const storedContent = (existingFile?.content?.length ? Buffer.from(existingFile.content) : null)
    ?? await loadStoredFileContent(existingFile?.storagePath ?? null);
  const forceRegenerate = new URL(request.url).searchParams.get("regenerate") === "1";
  const mustRegenerate =
    forceRegenerate ||
    !storedContent ||
    shouldRegenerateStoredContent(fileType, issue.template.layout, storedContent);
  let regeneratedFile: RegeneratedCertificateFile | null = null;
  let regenerationError: Error | null = null;

  if (mustRegenerate) {
    try {
      regeneratedFile = await regenerateFileContent(issue, fileType);
    } catch (error) {
      console.error("Falha ao regenerar arquivo do certificado.", error);
      regenerationError = error instanceof Error
        ? error
        : new Error("Nao foi possivel gerar o arquivo do certificado.");
    }
  }

  const content = regeneratedFile?.content ?? (mustRegenerate ? null : storedContent);

  if (!content) {
    if (regenerationError) {
      const converterUnavailable = regenerationError.message === DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE;
      return NextResponse.json(
        {
          error: converterUnavailable
            ? PDF_CONVERTER_UNAVAILABLE_USER_MESSAGE
            : regenerationError.message,
          code: converterUnavailable
            ? "PDF_CONVERTER_UNAVAILABLE"
            : "CERTIFICATE_FILE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: "Conteudo do arquivo nao encontrado." }, { status: 404 });
  }

  const filename = regeneratedFile?.filename ?? existingFile?.filename ?? getDownloadFilename(issue, fileType);
  const mimeType = regeneratedFile?.mimeType ?? existingFile?.mimeType ?? certificateFileMimeType(fileType);
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}

async function findIssueForDownload(issueId: string, type: CertificateFileType) {
  return prisma.certificateIssue.findUnique({
    where: { id: issueId },
    select: {
      id: true,
      verificationCode: true,
      values: true,
      deleteAt: true,
      issuedById: true,
      recipient: { select: { name: true } },
      template: {
        select: {
          name: true,
          width: true,
          height: true,
          background: true,
          layout: true,
        },
      },
      files: {
        where: { type },
        take: 1,
        select: {
          filename: true,
          mimeType: true,
          content: true,
          storagePath: true,
        },
      },
    },
  });
}

type DownloadIssue = NonNullable<Awaited<ReturnType<typeof findIssueForDownload>>>;

type RegeneratedCertificateFile = {
  content: Buffer;
  filename: string;
  mimeType: string;
};

function shouldRegenerateStoredContent(type: CertificateFileType, layout: unknown, content: Buffer) {
  if (type !== "PDF") return false;
  if (!content.subarray(0, 4).equals(Buffer.from("%PDF"))) return true;

  return content.length > 0 && content.length < STALE_OFFICE_PDF_MAX_BYTES && isOfficeBaseLayout(layout);
}

async function regenerateFileContent(issue: DownloadIssue, type: CertificateFileType): Promise<RegeneratedCertificateFile> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const values = readStringValues(issue.values);
  const renderInput = { template: issue.template, values, verificationCode: issue.verificationCode, appUrl };
  const content = type === "DOCX"
    ? await renderDocxBuffer(renderInput)
    : type === "PPTX"
      ? await renderPptxBuffer(renderInput)
      : await renderPdfBuffer(renderInput);
  const filename = getDownloadFilename(issue, type);
  const mimeType = certificateFileMimeType(type);

  await prisma.generatedFile.upsert({
    where: { issueId_type: { issueId: issue.id, type } },
    update: { filename, mimeType, content: toPrismaBytes(content), storagePath: null },
    create: { issueId: issue.id, type, filename, mimeType, content: toPrismaBytes(content) },
  });

  return { content, filename, mimeType };
}

function getDownloadFilename(issue: DownloadIssue, type: CertificateFileType) {
  if (type === "PDF") {
    return `${sanitizeFilenamePart(issue.recipient.name)}-${sanitizeFilenamePart(issue.verificationCode)}.pdf`;
  }

  return `${sanitizeFilenamePart(issue.recipient.name)}-${sanitizeFilenamePart(issue.template.name)}.${certificateFileExtension(type)}`;
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

function readStringValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item ?? "")]),
  );
}

async function loadStoredFileContent(storagePath: string | null) {
  if (!storagePath) return null;

  try {
    return await downloadCertificateFile(storagePath);
  } catch (error) {
    console.warn("Falha ao baixar arquivo do storage.", error);
    return null;
  }
}

function toPrismaBytes(buffer: Buffer) {
  return Uint8Array.from(buffer);
}
