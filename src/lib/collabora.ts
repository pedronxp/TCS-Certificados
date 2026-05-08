import { jwtVerify, SignJWT } from "jose";

type CollaboraTokenPayload = {
  templateId: string;
  userId: string;
  userName: string;
  purpose: "template-docx";
};

export type CollaboraHealthStatus = {
  online: boolean;
  url: string;
  latencyMs: number;
  error?: string;
};

export function collaboraDocumentServerUrl() {
  return (
    process.env.NEXT_PUBLIC_COLLABORA_URL ||
    process.env.COLLABORA_URL ||
    "http://localhost:9980"
  ).replace(/\/$/, "");
}

export function collaboraInternalAppUrl() {
  return (
    process.env.COLLABORA_INTERNAL_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://host.docker.internal:3000"
  ).replace(/\/$/, "");
}

export function collaboraEditorUrl({
  templateId,
  accessToken,
}: {
  templateId: string;
  accessToken: string;
}) {
  const wopiSrc = `${collaboraInternalAppUrl()}/api/wopi/templates/${templateId}`;
  const params = new URLSearchParams({
    WOPISrc: wopiSrc,
    access_token: accessToken,
    lang: "pt-BR",
  });

  return `${collaboraDocumentServerUrl()}/browser/dist/cool.html?${params}`;
}

export async function createCollaboraAccessToken(payload: CollaboraTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(collaboraSecret());
}

export async function verifyCollaboraAccessToken(token: string | null, templateId: string) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, collaboraSecret());
    if (payload.purpose !== "template-docx") return null;
    if (payload.templateId !== templateId) return null;

    return {
      templateId: String(payload.templateId),
      userId: String(payload.userId),
      userName: String(payload.userName ?? "Usuario"),
    };
  } catch {
    return null;
  }
}

export async function checkCollaboraHealth(): Promise<CollaboraHealthStatus> {
  const url = collaboraDocumentServerUrl();
  const start = Date.now();

  try {
    const response = await fetch(`${url}/hosting/discovery`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { online: true, url, latencyMs };
    }

    return {
      online: false,
      url,
      latencyMs,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      online: false,
      url,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function officeDocxFilename(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "modelo";

  return `${normalized}.docx`;
}

export function wopiUserId(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "") || "user";
}

function collaboraSecret() {
  return new TextEncoder().encode(
    process.env.COLLABORA_ACCESS_TOKEN_SECRET ||
      process.env.SESSION_SECRET ||
      "dev-secret-change-me",
  );
}
