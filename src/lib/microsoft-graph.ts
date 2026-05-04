import { randomUUID } from "node:crypto";

const DEFAULT_GRAPH_API_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const DEFAULT_GRAPH_TIMEOUT_MS = 60000;

type MicrosoftGraphTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type MicrosoftGraphDriveItem = {
  id?: string;
  name?: string;
  parentReference?: {
    driveId?: string;
  };
};

type MicrosoftGraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId?: string;
  userId?: string;
  folderPath: string;
  apiUrl: string;
  tokenUrl: string;
  timeoutMs: number;
};

export async function convertDocxToPdfWithMicrosoftGraph(docxBuffer: Buffer): Promise<Buffer | null> {
  const config = getMicrosoftGraphConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let uploadedItem: MicrosoftGraphDriveItem | null = null;
  let accessToken = "";

  try {
    accessToken = await getAccessToken(config, controller.signal);
    uploadedItem = await uploadDocx(config, accessToken, docxBuffer, controller.signal);
    const pdf = await downloadAsPdf(config, accessToken, uploadedItem, controller.signal);
    return pdf;
  } catch (error) {
    console.warn("[Microsoft Graph] conversor indisponivel:", error);
    return null;
  } finally {
    if (uploadedItem?.id && accessToken) {
      await deleteUploadedItem(config, accessToken, uploadedItem).catch((error) => {
        console.warn("[Microsoft Graph] nao foi possivel remover DOCX temporario:", error);
      });
    }
    clearTimeout(timeout);
  }
}

function getMicrosoftGraphConfig(): MicrosoftGraphConfig | null {
  const tenantId = process.env.MICROSOFT_GRAPH_TENANT_ID?.trim();
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) return null;

  const driveId = process.env.MICROSOFT_GRAPH_DRIVE_ID?.trim();
  const userId = process.env.MICROSOFT_GRAPH_USER_ID?.trim();
  if (!driveId && !userId) return null;

  return {
    tenantId,
    clientId,
    clientSecret,
    driveId,
    userId,
    folderPath: normalizeFolderPath(process.env.MICROSOFT_GRAPH_FOLDER_PATH ?? ""),
    apiUrl: normalizeBaseUrl(process.env.MICROSOFT_GRAPH_API_BASE_URL || DEFAULT_GRAPH_API_URL),
    tokenUrl: normalizeBaseUrl(process.env.MICROSOFT_GRAPH_TOKEN_BASE_URL || "https://login.microsoftonline.com"),
    timeoutMs: parsePositiveInteger(process.env.MICROSOFT_GRAPH_TIMEOUT_MS, DEFAULT_GRAPH_TIMEOUT_MS),
  };
}

async function getAccessToken(config: MicrosoftGraphConfig, signal: AbortSignal) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: DEFAULT_GRAPH_SCOPE,
    grant_type: "client_credentials",
  });

  const response = await fetch(`${config.tokenUrl}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
  });

  if (!response.ok) {
    throw new Error(`token HTTP ${response.status}: ${await response.text()}`);
  }

  const token = await response.json() as MicrosoftGraphTokenResponse;
  if (!token.access_token) throw new Error("token de acesso ausente.");
  return token.access_token;
}

async function uploadDocx(
  config: MicrosoftGraphConfig,
  accessToken: string,
  docxBuffer: Buffer,
  signal: AbortSignal,
) {
  const fileName = `tcs-certificados-${randomUUID()}.docx`;
  const uploadPath = encodeDrivePath(joinDrivePath(config.folderPath, fileName));
  const url = config.driveId
    ? `${config.apiUrl}/drives/${encodeURIComponent(config.driveId)}/root:/${uploadPath}:/content`
    : `${config.apiUrl}/users/${encodeURIComponent(config.userId ?? "")}/drive/root:/${uploadPath}:/content`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    body: bufferToArrayBuffer(docxBuffer),
    signal,
  });

  if (!response.ok) {
    throw new Error(`upload HTTP ${response.status}: ${await response.text()}`);
  }

  const item = await response.json() as MicrosoftGraphDriveItem;
  if (!item.id) throw new Error("upload nao retornou driveItem.id.");
  return item;
}

async function downloadAsPdf(
  config: MicrosoftGraphConfig,
  accessToken: string,
  item: MicrosoftGraphDriveItem,
  signal: AbortSignal,
) {
  const driveId = item.parentReference?.driveId ?? config.driveId;
  const itemId = item.id;
  if (!itemId) throw new Error("driveItem.id ausente para conversao.");

  const url = driveId
    ? `${config.apiUrl}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content?format=pdf`
    : `${config.apiUrl}/users/${encodeURIComponent(config.userId ?? "")}/drive/items/${encodeURIComponent(itemId)}/content?format=pdf`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    redirect: "manual",
    signal,
  });

  if (isRedirect(response.status)) {
    const location = response.headers.get("Location");
    if (!location) throw new Error("redirect sem Location para PDF convertido.");

    const redirected = await fetch(location, { signal });
    if (!redirected.ok) {
      throw new Error(`download redirecionado HTTP ${redirected.status}: ${await redirected.text()}`);
    }
    return Buffer.from(await redirected.arrayBuffer());
  }

  if (!response.ok) {
    throw new Error(`conversao HTTP ${response.status}: ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function deleteUploadedItem(
  config: MicrosoftGraphConfig,
  accessToken: string,
  item: MicrosoftGraphDriveItem,
) {
  const driveId = item.parentReference?.driveId ?? config.driveId;
  if (!driveId || !item.id) return;

  const response = await fetch(
    `${config.apiUrl}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(item.id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 15000)),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(`delete HTTP ${response.status}: ${await response.text()}`);
  }
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function normalizeFolderPath(value: string) {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function joinDrivePath(folderPath: string, fileName: string) {
  return folderPath ? `${folderPath}/${fileName}` : fileName;
}

function encodeDrivePath(value: string) {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}
