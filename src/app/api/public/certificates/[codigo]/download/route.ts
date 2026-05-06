import { NextResponse } from "next/server";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";
import {
  DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE,
  renderDocxBuffer,
  renderPdfBuffer,
} from "@/lib/render-certificate";
import { verifyIssueDocument } from "@/lib/public-certificate-validation";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIp,
} from "@/lib/rate-limit";
import { downloadCertificateFile } from "@/lib/supabase";
import { normalizeVerificationCode } from "@/lib/verification-code";

const PUBLIC_DOWNLOAD_RATE_LIMIT_ACTION = "public.validation.download";
const PUBLIC_DOWNLOAD_RATE_LIMIT_ATTEMPTS = 30;
const PUBLIC_DOWNLOAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const PDF_CONVERTER_UNAVAILABLE_USER_MESSAGE =
  "Nao foi possivel gerar o PDF deste certificado agora. Tente novamente mais tarde.";

type FileType = "PDF" | "DOCX";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ codigo: string }> },
) {
  const rateLimit = await consumeRateLimit({
    action: PUBLIC_DOWNLOAD_RATE_LIMIT_ACTION,
    key: getClientIp(request.headers),
    limit: PUBLIC_DOWNLOAD_RATE_LIMIT_ATTEMPTS,
    windowMs: PUBLIC_DOWNLOAD_RATE_LIMIT_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas consultas. Aguarde alguns minutos antes de tentar novamente." },
      { status: 429, headers: buildRateLimitHeaders(rateLimit) },
    );
  }

  await expireScheduledCertificateDocuments().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const { codigo: rawCodigo } = await context.params;
  const codigo = normalizeVerificationCode(rawCodigo);
  const url = new URL(request.url);
  const documentValue = String(url.searchParams.get("documento") ?? "").trim();
  const fileType = normalizeFileType(url.searchParams.get("type"));
  const issue = await findIssueForPublicDownload(codigo, fileType);

  if (!issue) {
    return NextResponse.json({ error: "Arquivo nao encontrado." }, { status: 404 });
  }

  if (!verifyIssueDocument(issue, documentValue).matched) {
    return NextResponse.json(
      { error: "Documento nao confere com este certificado." },
      { status: 403 },
    );
  }

  if (issue.status !== "ISSUED") {
    return NextResponse.json(
      { error: "Este certificado possui restricao e nao pode ser visualizado publicamente." },
      { status: 403 },
    );
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
  let regeneratedContent: Buffer | null = null;
  let regenerationError: Error | null = null;

  if (!storedContent) {
    try {
      regeneratedContent = await regeneratePublicFileContent(issue, fileType);
    } catch (error) {
      console.error("Falha ao regenerar arquivo publico do certificado.", error);
      regenerationError = error instanceof Error
        ? error
        : new Error("Nao foi possivel gerar o arquivo do certificado.");
    }
  }

  const content = storedContent ?? regeneratedContent;

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

  const filename = existingFile?.filename ?? getPublicFilename(issue, fileType);
  const mimeType = existingFile?.mimeType ?? getPublicMimeType(fileType);
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function findIssueForPublicDownload(code: string, type: FileType) {
  return prisma.certificateIssue.findUnique({
    where: { verificationCode: code },
    select: {
      id: true,
      verificationCode: true,
      values: true,
      status: true,
      deleteAt: true,
      recipient: { select: { name: true, document: true } },
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
      },
    },
  });
}

type PublicDownloadIssue = NonNullable<Awaited<ReturnType<typeof findIssueForPublicDownload>>>;

async function regeneratePublicFileContent(issue: PublicDownloadIssue, type: FileType) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const values = readStringValues(issue.values);
  const content = type === "DOCX"
    ? await renderDocxBuffer({ template: issue.template, values, verificationCode: issue.verificationCode, appUrl })
    : await renderPdfBuffer({ template: issue.template, values, verificationCode: issue.verificationCode, appUrl });
  const filename = getPublicFilename(issue, type);
  const mimeType = getPublicMimeType(type);

  await prisma.generatedFile.upsert({
    where: { issueId_type: { issueId: issue.id, type } },
    update: { filename, mimeType, content },
    create: { issueId: issue.id, type, filename, mimeType, content },
  });

  return content;
}

function normalizeFileType(type: string | null): FileType {
  return type?.toUpperCase() === "DOCX" ? "DOCX" : "PDF";
}

function getPublicMimeType(type: FileType) {
  return type === "DOCX"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/pdf";
}

function getPublicFilename(issue: PublicDownloadIssue, type: FileType) {
  const extension = type === "DOCX" ? "docx" : "pdf";
  return `${sanitizeFilenamePart(issue.recipient.name)}-${sanitizeFilenamePart(issue.template.name)}.${extension}`;
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item ?? "")]),
  );
}

async function loadStoredFileContent(storagePath: string | null) {
  if (!storagePath) return null;

  try {
    return await downloadCertificateFile(storagePath);
  } catch (error) {
    console.warn("Falha ao baixar arquivo publico do storage.", error);
    return null;
  }
}
