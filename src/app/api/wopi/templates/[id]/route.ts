import { NextResponse } from "next/server";
import { officeDocxFilename, verifyCollaboraAccessToken, wopiUserId } from "@/lib/collabora";
import { getWopiLock, setWopiLock, clearWopiLock } from "@/lib/wopi-locks";
import { readTemplateDocx } from "@/lib/wopi-template-docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await verifyAccess(request, id);
  if (!access) return unauthorized();

  const result = await readTemplateDocx(id);
  if (!result) return NextResponse.json({ error: "Modelo DOCX nao encontrado." }, { status: 404 });

  return NextResponse.json(
    {
      BaseFileName: officeDocxFilename(result.template.name),
      OwnerId: wopiUserId(result.template.createdById),
      Size: result.content.byteLength,
      UserId: wopiUserId(access.userId),
      UserFriendlyName: access.userName,
      UserCanWrite: true,
      UserCanNotWriteRelative: true,
      SupportsUpdate: true,
      SupportsLocks: true,
      SupportsGetLock: true,
      SupportsExtendedLockLength: true,
      HideExportOption: false,
      HidePrintOption: false,
      LastModifiedTime: result.template.updatedAt.toISOString(),
      Version: result.version,
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await verifyAccess(request, id);
  if (!access) return unauthorized();

  const override = request.headers.get("x-wopi-override")?.toUpperCase() ?? "";
  const requestedLock = request.headers.get("x-wopi-lock") ?? "";
  const currentLock = getWopiLock(id);

  if (override === "GET_LOCK") {
    return new Response(null, {
      status: 200,
      headers: { "X-WOPI-Lock": currentLock },
    });
  }

  if (override === "LOCK") {
    if (currentLock && currentLock !== requestedLock) return lockMismatch(currentLock);
    setWopiLock(id, requestedLock);
    return new Response(null, { status: 200 });
  }

  if (override === "REFRESH_LOCK") {
    if (currentLock !== requestedLock) return lockMismatch(currentLock);
    setWopiLock(id, requestedLock);
    return new Response(null, { status: 200 });
  }

  if (override === "UNLOCK") {
    if (currentLock !== requestedLock) return lockMismatch(currentLock);
    clearWopiLock(id);
    return new Response(null, { status: 200 });
  }

  if (override === "UNLOCK_AND_RELOCK") {
    const oldLock = request.headers.get("x-wopi-oldlock") ?? "";
    if (currentLock !== oldLock) return lockMismatch(currentLock);
    setWopiLock(id, requestedLock);
    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 501 });
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

function lockMismatch(currentLock: string) {
  return new Response(null, {
    status: 409,
    headers: {
      "X-WOPI-Lock": currentLock,
      "X-WOPI-LockFailureReason": "Lock mismatch",
    },
  });
}
