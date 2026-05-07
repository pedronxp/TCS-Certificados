import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { templateBaseAssetSchema } from "@/lib/certificate-layout";
import { buildDocxPreview } from "@/lib/docx-preview-service";
import { buildPptxPreview } from "@/lib/pptx-preview-service";
import { validateOfficePreviewFile } from "@/lib/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo nao enviado." }, { status: 400 });
  }

  const fileError = validateOfficePreviewFile(file);
  if (fileError) {
    return NextResponse.json({ error: fileError }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const assetsJson = formData.get("assets");
    const assets = typeof assetsJson === "string"
      ? templateBaseAssetSchema.array().parse(JSON.parse(assetsJson))
      : undefined;
    const preview = isPptxFile(file)
      ? await buildPptxPreview(buffer)
      : await buildDocxPreview(buffer, { assets });
    return NextResponse.json(preview);
  } catch (error) {
    console.error("Falha ao gerar preview do documento", error);
    return NextResponse.json(
      { error: "Nao foi possivel gerar o fundo do documento." },
      { status: 500 },
    );
  }
}

function isPptxFile(file: File) {
  return file.name.toLowerCase().endsWith(".pptx") || file.type.includes("presentationml");
}
