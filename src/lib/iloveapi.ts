import { createHmac } from "node:crypto";

const DEFAULT_ILOVEAPI_BASE_URL = "https://api.ilovepdf.com/v1";
const DEFAULT_ILOVEAPI_REGION = "us";
const DEFAULT_ILOVEAPI_TIMEOUT_MS = 55000;

type ILoveApiInput = {
  buffer: Buffer;
  inputFormat: string;
  fileName?: string;
  mimeType?: string;
};

type ILoveApiStartResponse = {
  server: string;
  task: string;
};

type ILoveApiUploadResponse = {
  server_filename: string;
};

type ILoveApiConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  region: string;
  timeoutMs: number;
};

export async function convertOfficeToPdfWithILoveApi(input: ILoveApiInput): Promise<Buffer | null> {
  const configs = getILoveApiConfigs();
  if (!configs.length) return null;

  const normalizedInput = normalizeInput(input);
  const failures: string[] = [];

  for (const config of configs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const token = createILoveApiToken(config);
      const start = await iLoveApiFetch<ILoveApiStartResponse>(
        `${config.baseUrl}/start/officepdf/${config.region}`,
        token,
        { method: "GET", signal: controller.signal },
      );
      const serverUrl = normalizeServerUrl(start.server);
      const upload = await uploadOfficeFileToILoveApi(serverUrl, start.task, token, normalizedInput, controller.signal);

      await iLoveApiFetch<unknown>(`${serverUrl}/v1/process`, token, {
        method: "POST",
        body: JSON.stringify({
          task: start.task,
          tool: "officepdf",
          files: [
            {
              server_filename: upload.server_filename,
              filename: normalizedInput.fileName,
            },
          ],
        }),
        signal: controller.signal,
      });

      const response = await fetch(`${serverUrl}/v1/download/${start.task}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        failures.push(`download HTTP ${response.status}: ${await response.text()}`);
        continue;
      }

      const output = Buffer.from(await response.arrayBuffer());
      if (output.subarray(0, 4).equals(Buffer.from("%PDF"))) return output;
      failures.push("download nao retornou PDF direto");
    } catch (error) {
      failures.push(describeError(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (failures.length) {
    console.warn("[iLoveAPI] conversor indisponivel:", failures.join(" | "));
  }

  return null;
}

export function hasILoveApiCredentials() {
  return getILoveApiConfigs().length > 0;
}

function getILoveApiConfigs(): ILoveApiConfig[] {
  const publicKeys = splitEnvValues([
    process.env.ILOVEAPI_PUBLIC_KEY,
    process.env.ILOVEAPI_PUBLIC_KEYS,
    process.env.ILOVEAPI_PUBLIC_KEY_1,
    process.env.ILOVEAPI_PUBLIC_KEY_2,
    process.env.ILOVEAPI_PUBLIC_KEY_3,
  ]);
  const secretKeys = splitEnvValues([
    process.env.ILOVEAPI_SECRET_KEY,
    process.env.ILOVEAPI_SECRET_KEYS,
    process.env.ILOVEAPI_SECRET_KEY_1,
    process.env.ILOVEAPI_SECRET_KEY_2,
    process.env.ILOVEAPI_SECRET_KEY_3,
  ]);
  const count = Math.min(publicKeys.length, secretKeys.length);
  const baseConfig = {
    baseUrl: normalizeBaseUrl(process.env.ILOVEAPI_BASE_URL || DEFAULT_ILOVEAPI_BASE_URL),
    region: normalizeRegion(process.env.ILOVEAPI_REGION || DEFAULT_ILOVEAPI_REGION),
    timeoutMs: parsePositiveInteger(process.env.ILOVEAPI_TIMEOUT_MS, DEFAULT_ILOVEAPI_TIMEOUT_MS),
  };

  return Array.from({ length: count }, (_, index) => ({
    publicKey: publicKeys[index],
    secretKey: secretKeys[index],
    ...baseConfig,
  }));
}

function createILoveApiToken(config: ILoveApiConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: "api.ilovepdf.com",
    aud: "",
    iat: now,
    nbf: now,
    exp: now + 3600,
    jti: config.publicKey,
  }));
  const signature = createHmac("sha256", config.secretKey)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

async function uploadOfficeFileToILoveApi(
  serverUrl: string,
  task: string,
  token: string,
  input: Required<ILoveApiInput>,
  signal: AbortSignal,
) {
  const formData = new FormData();
  formData.append("task", task);
  formData.append(
    "file",
    new Blob([bufferToArrayBuffer(input.buffer)], { type: input.mimeType }),
    input.fileName,
  );

  return iLoveApiFetch<ILoveApiUploadResponse>(`${serverUrl}/v1/upload`, token, {
    method: "POST",
    body: formData,
    signal,
  });
}

async function iLoveApiFetch<T>(url: string, token: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`iLoveAPI HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json() as T;
}

function normalizeInput(input: ILoveApiInput): Required<ILoveApiInput> {
  const inputFormat = input.inputFormat.replace(/[^a-z0-9]/gi, "").toLowerCase() || "docx";
  return {
    buffer: input.buffer,
    inputFormat,
    fileName: input.fileName?.trim() || `template.${inputFormat}`,
    mimeType: input.mimeType?.trim() || defaultOfficeMimeType(inputFormat),
  };
}

function defaultOfficeMimeType(inputFormat: string) {
  if (inputFormat === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }

  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function splitEnvValues(values: Array<string | undefined>) {
  return [...new Set(
    values
      .flatMap((value) => String(value ?? "").split(/[,\n]/g))
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function normalizeServerUrl(server: string) {
  const value = server.trim().replace(/\/$/, "");
  return value.startsWith("http") ? value : `https://${value}`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function normalizeRegion(value: string) {
  const region = value.trim().toLowerCase();
  return ["eu", "us", "fr", "de", "pl"].includes(region) ? region : DEFAULT_ILOVEAPI_REGION;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
