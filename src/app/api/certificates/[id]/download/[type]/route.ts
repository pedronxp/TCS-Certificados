import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";
import {
  DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE,
  renderDocxBuffer,
  renderPdfBuffer,
} from "@/lib/render-certificate";
import { downloadCertificateFile } from "@/lib/supabase";

const PDF_CONVERTER_UNAVAILABLE_USER_MESSAGE =
  "Não foi possível gerar o PDF deste certificado agora. Baixe o DOCX enquanto a conversão para PDF é configurada no servidor.";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; type: string }> },
) {
  const user = await requireUser();
  await expireScheduledCertificateDocuments().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const { id, type } = await context.params;
  const fileType = type.toUpperCase() === "DOCX" ? "DOCX" : "PDF";
  const file = await prisma.generatedFile.findFirst({
    where: { issueId: id, type: fileType },
    include: {
      issue: {
        select: {
          recipient: { select: { name: true } },
          template: { select: { name: true } },
          deleteAt: true,
          issuedById: true,
        },
      },
    },
  });

  if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  if (user.role !== "ADMIN" && file.issue.issuedById !== user.id) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  if (isCertificateDocumentExpired(file.issue.deleteAt)) {
    return NextResponse.json(
      {
        error: "Documento expirado. O codigo de validacao continua ativo, mas o arquivo nao esta mais disponivel.",
        code: "CERTIFICATE_DOCUMENT_EXPIRED",
      },
      { status: 410 },
    );
  }
  const storedContent = (file.content?.length ? Buffer.from(file.content) : null)
    ?? await loadStoredFileContent(file.storagePath);
  let regeneratedContent: Buffer | null = null;
  let regenerationError: Error | null = null;

  if (!storedContent) {
    try {
      regeneratedContent = await regenerateFileContent(id, fileType);
    } catch (error) {
      console.error("Falha ao regenerar arquivo do certificado.", error);
      regeneratedContent = null;
      regenerationError = error instanceof Error ? error : new Error("Não foi possível gerar o arquivo do certificado.");
    }
  }

  const content = storedContent ?? regeneratedContent;

  if (!content) {
    if (regenerationError) {
      return NextResponse.json(
        {
          error: regenerationError.message === DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE
            ? PDF_CONVERTER_UNAVAILABLE_USER_MESSAGE
            : regenerationError.message,
          code: regenerationError.message === DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE
            ? "PDF_CONVERTER_UNAVAILABLE"
            : "CERTIFICATE_FILE_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: "Conteúdo do arquivo não encontrado." }, { status: 404 });
  }
  const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(getDownloadFilename(file))}"`,
    },
  });
}

function getDownloadFilename(file: {
  filename: string;
  type: "PDF" | "DOCX";
  issue: { recipient: { name: string }; template: { name: string } };
}) {
  if (file.type !== "DOCX") return file.filename;
  return `${sanitizeFilenamePart(file.issue.recipient.name)}-${sanitizeFilenamePart(file.issue.template.name)}.docx`;
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

async function loadStoredFileContent(storagePath: string | null) {
  if (!storagePath) return null;

  try {
    return await downloadCertificateFile(storagePath);
  } catch (error) {
    console.warn("Falha ao baixar arquivo do storage.", error);
    return null;
  }
}

async function regenerateFileContent(issueId: string, type: "PDF" | "DOCX") {
  const issue = await prisma.certificateIssue.findUnique({
    where: { id: issueId },
    select: {
      verificationCode: true,
      values: true,
      template: {
        select: {
          name: true,
          width: true,
          height: true,
          background: true,
          layout: true,
        },
      },
    },
  });

  if (!issue) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const values = issue.values && typeof issue.values === "object" && !Array.isArray(issue.values)
    ? Object.fromEntries(Object.entries(issue.values).map(([key, value]) => [key, String(value ?? "")]))
    : {};
  const content = type === "DOCX"
    ? await renderDocxBuffer({ template: issue.template, values, verificationCode: issue.verificationCode, appUrl })
    : await renderPdfBuffer({ template: issue.template, values, verificationCode: issue.verificationCode, appUrl });

  await prisma.generatedFile.updateMany({
    where: { issueId, type },
    data: { content },
  });

  return content;
}
