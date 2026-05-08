import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { expireCertificateDocuments } from "@/lib/certificate-service";

export async function DELETE(request: Request) {
  await requireAdmin();
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)) : [];

  if (!ids.length) {
    return NextResponse.json(
      { error: "Selecione ao menos um certificado para remover os documentos." },
      { status: 400 },
    );
  }

  const expired = await expireCertificateDocuments(ids);
  return NextResponse.json({ expired });
}
