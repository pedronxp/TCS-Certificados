import { Socket } from "node:net";

const DEFAULT_GOTENBERG_URL = "http://localhost:3010";
const LOCAL_CONNECT_TIMEOUT_MS = 1000;

export async function convertDocxToPdfWithGotenberg(docxBuffer: Buffer): Promise<Buffer | null> {
  const configuredUrl = process.env.GOTENBERG_URL || (process.env.NODE_ENV === "production" ? "" : DEFAULT_GOTENBERG_URL);
  if (!configuredUrl) return null;

  const baseUrl = configuredUrl.replace(/\/$/, "");
  const parsedUrl = new URL(baseUrl);
  if (isLocalHost(parsedUrl.hostname) && !await canConnect(parsedUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const docxArrayBuffer = docxBuffer.buffer.slice(
      docxBuffer.byteOffset,
      docxBuffer.byteOffset + docxBuffer.byteLength,
    ) as ArrayBuffer;
    const formData = new FormData();
    formData.append(
      "files",
      new Blob([docxArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "certificate.docx",
    );

    const response = await fetch(`${baseUrl}/forms/libreoffice/convert`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[Gotenberg] falha ao converter DOCX:", response.status, await response.text());
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn("[Gotenberg] conversor indisponivel:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isLocalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function canConnect(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));

  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    let done = false;

    function finish(result: boolean) {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    }

    socket.setTimeout(LOCAL_CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}
