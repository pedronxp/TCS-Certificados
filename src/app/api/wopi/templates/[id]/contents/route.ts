import { NextResponse } from "next/server";
import { officeDocxFilename, verifyCollaboraAccessToken } from "@/lib/collabora";
import { getWopiLock } from "@/lib/wopi-locks";
import { readTemplateDocx, saveTemplateDocx } from "@/lib/wopi-template-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await verifyAccess(request, id);
  if (!access) return unauthorized();

  const result = await readTemplateDocx(id);
  if (!result) return NextResponse.json({ error: "Modelo DOCX nao encontrado." }, { status: 404 });

  const body = result.content.buffer.slice(
    result.content.byteOffset,
    result.content.byteOffset + result.content.byteLength,
  ) as ArrayBuffer;

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `inline; filename="${encodeURIComponent(officeDocxFilename(result.template.name))}"`,
      "X-WOPI-ItemVersion": result.version,
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await verifyAccess(request, id);
  if (!access) return unauthorized();

  const requestedLock = request.headers.get("x-wopi-lock") ?? "";
  const currentLock = getWopiLock(id);
  if (currentLock && currentLock !== requestedLock) {
    return new Response(null, {
      status: 409,
      headers: {
        "X-WOPI-Lock": currentLock,
        "X-WOPI-LockFailureReason": "Lock mismatch",
      },
    });
  }

  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    const saved = await saveTemplateDocx(id, buffer);
    if (!saved) return NextResponse.json({ error: "Modelo DOCX nao encontrado." }, { status: 404 });

    return new Response(null, {
      status: 200,
      headers: {
        "X-WOPI-ItemVersion": saved.version,
      },
    });
  } catch (error) {
    console.error("Falha ao salvar DOCX do Collabora/LibreOffice", error);
    return NextResponse.json({ error: "Nao foi possivel salvar o DOCX." }, { status: 500 });
  }
}

async function verifyAccess(request: Request, templateId: string) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("access_token");
  const authToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  return verifyCollaboraAccessToken(queryToken || authToken, templateId);
}

function unauthorized() {
  return NextResponse.json({ error: "Acesso negado." }, { status: 401 });
}
