import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { issueCertificate } from "@/lib/certificate-service";
import { normalizeCertificateOutputMode } from "@/lib/certificate-output-format";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json();

  try {
    const issue = await issueCertificate({
      templateId: String(body.templateId),
      values: body.values ?? {},
      issuedById: user.id,
      isTest: Boolean(body.isTest),
      outputMode: normalizeCertificateOutputMode(body.outputMode),
    });
    return NextResponse.json(issue, { status: 201 });
  } catch (error) {
    console.error("Falha ao emitir certificado", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao emitir certificado." },
      { status: 400 },
    );
  }
}
