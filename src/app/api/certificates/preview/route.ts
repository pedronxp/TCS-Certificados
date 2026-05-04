import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { renderCertificatePreviewPdf } from "@/lib/certificate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json();

  try {
    const pdf = await renderCertificatePreviewPdf({
      templateId: String(body.templateId),
      values: normalizeValues(body.values),
      issuedById: user.id,
    });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="previa-certificado.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Falha ao gerar previa do certificado", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerar previa do certificado." },
      { status: 400 },
    );
  }
}

function normalizeValues(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}
