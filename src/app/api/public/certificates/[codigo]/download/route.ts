import { NextResponse } from "next/server";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import {
  canDownloadCertificateFile,
  certificateFileExtension,
  certificateFileMimeType,
  NON_EDITABLE_NATIVE_DOWNLOAD_ERROR,
  normalizeCertificateFileType,
  shouldRegenerateCertificateFile,
  type CertificateFileType,
} from "@/lib/certificate-output-format";
import { prisma } from "@/lib/prisma";
import {
  DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE,
  renderDocxBuffer,
  renderPdfBuffer,
  renderPptxBuffer,
} from "@/lib/render-certificate";
import { verifyIssueDocument } from "@/lib/public-certificate-validation";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIp,
} from "@/lib/rate-limit";
import { downloadCertificateFile } from "@/lib/supabase";
import { refreshDocxTemplatePreviewIfNeeded } from "@/lib/template-preview-refresh";
import { normalizeVerificationCode } from "@/lib/verification-code";

const PUBLIC_DOWNLOAD_RATE_LIMIT_ACTION = "public.validation.download";
const PUBLIC_DOWNLOAD_RATE_LIMIT_ATTEMPTS = 30;
const PUBLIC_DOWNLOAD_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PDF_CONVERTER_UNAVAILABLE_USER_MESSAGE =
  "Nao foi possivel gerar o PDF deste certificado agora. Tente novamente mais tarde.";

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
  const fileType = normalizeCertificateFileType(url.searchParams.get("type"));
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
  if (!canDownloadCertificateFile(issue.outputMode, fileType)) {
    return NextResponse.json(
      {
        error: NON_EDITABLE_NATIVE_DOWNLOAD_ERROR,
        code: "CERTIFICATE_NATIVE_DOWNLOAD_BLOCKED",
      },
      { status: 403 },
    );
  }

  const existingFile = issue.files[0] ?? null;
  const storedContent = (existingFile?.content?.length ? Buffer.from(existingFile.content) : null)
    ?? await loadStoredFileContent(existingFile?.storagePath ?? null);
  const forceRegenerate = url.searchParams.get("regenerate") === "1";
  const mustRegenerate =
    forceRegenerate ||
    !storedContent ||
    await shouldRegenerateCertificateFile(fileType, issue.template.layout, storedContent);
  let regeneratedFile: RegeneratedCertificateFile | null = null;
  let regenerationError: Error | null = null;

  if (mustRegenerate) {
    try {
      regeneratedFile = await regeneratePublicFileContent(issue, fileType);
    } catch (error) {
      console.error("Falha ao regenerar arquivo publico do certificado.", error);
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

  const filename = regeneratedFile?.filename ?? existingFile?.filename ?? getPublicFilename(issue, fileType);
  const mimeType = regeneratedFile?.mimeType ?? existingFile?.mimeType ?? certificateFileMimeType(fileType);
  const disposition = fileType === "PDF" ? "inline" : "attachment";
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(filename)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function findIssueForPublicDownload(code: string, type: CertificateFileType) {
  return prisma.certificateIssue.findUnique({
    where: { verificationCode: code },
    select: {
      id: true,
      verificationCode: true,
      values: true,
      status: true,
      outputMode: true,
      deleteAt: true,
      recipient: { select: { name: true, document: true } },
      template: {
        select: {
          id: true,
          name: true,
          width: true,
          height: true,
          orientation: true,
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

type PublicDownloadIssue = NonNullable<Awaited<ReturnType<typeof findIssueForPublicDownload>>>;

type RegeneratedCertificateFile = {
  content: Buffer;
  filename: string;
  mimeType: string;
};

async function regeneratePublicFileContent(
  issue: PublicDownloadIssue,
  type: CertificateFileType,
): Promise<RegeneratedCertificateFile> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const values = readStringValues(issue.values);
  const template = await refreshDocxTemplatePreviewIfNeeded(issue.template);
  const renderInput = { template, values, verificationCode: issue.verificationCode, appUrl };
  const content = type === "DOCX"
    ? await renderDocxBuffer(renderInput)
    : type === "PPTX"
      ? await renderPptxBuffer(renderInput)
      : await renderPdfBuffer(renderInput);
  const filename = getPublicFilename(issue, type);
  const mimeType = certificateFileMimeType(type);

  await prisma.generatedFile.upsert({
    where: { issueId_type: { issueId: issue.id, type } },
    update: { filename, mimeType, content: toPrismaBytes(content), storagePath: null },
    create: { issueId: issue.id, type, filename, mimeType, content: toPrismaBytes(content) },
  });

  return { content, filename, mimeType };
}

function getPublicFilename(issue: PublicDownloadIssue, type: CertificateFileType) {
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

function toPrismaBytes(buffer: Buffer) {
  return Uint8Array.from(buffer);
}
