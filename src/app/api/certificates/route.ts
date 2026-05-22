import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteCertificateIssues, expireCertificateDocuments } from "@/lib/certificate-service";

export async function DELETE(request: Request) {
  await requireAdmin();
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)) : [];
  const permanently = body?.action === "delete-permanently";

  if (!ids.length) {
    return NextResponse.json(
      { error: permanently ? "Selecione ao menos um certificado para excluir." : "Selecione ao menos um certificado para remover os documentos." },
      { status: 400 },
    );
  }

  if (permanently) {
    const deleted = await deleteCertificateIssues(ids);
    return NextResponse.json({ deleted });
  }

  const expired = await expireCertificateDocuments(ids);
  return NextResponse.json({ expired });
}
