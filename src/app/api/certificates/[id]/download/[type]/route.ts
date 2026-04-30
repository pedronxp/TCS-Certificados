import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteExpiredCertificateIssues } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";
import { downloadCertificateFile } from "@/lib/supabase";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; type: string }> },
) {
  await requireUser();
  await deleteExpiredCertificateIssues().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const { id, type } = await context.params;
  const file = await prisma.generatedFile.findFirst({
    where: { issueId: id, type: type.toUpperCase() === "DOCX" ? "DOCX" : "PDF" },
  });

  if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const content = file.storagePath
    ? await downloadCertificateFile(file.storagePath)
    : file.content;

  if (!content) {
    return NextResponse.json({ error: "Conteúdo do arquivo não encontrado." }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}
