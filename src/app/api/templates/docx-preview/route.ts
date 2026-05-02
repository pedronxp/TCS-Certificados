import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildDocxPreview } from "@/lib/docx-preview-service";
import { validateDocxFile } from "@/lib/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo DOCX nao enviado." }, { status: 400 });
  }

  const fileError = validateDocxFile(file);
  if (fileError) {
    return NextResponse.json({ error: fileError }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await buildDocxPreview(buffer);
    return NextResponse.json(preview);
  } catch (error) {
    console.error("Falha ao gerar preview DOCX", error);
    return NextResponse.json(
      { error: "Nao foi possivel gerar o fundo do DOCX." },
      { status: 500 },
    );
  }
}
