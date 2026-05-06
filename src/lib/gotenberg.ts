import { Socket } from "node:net";

/**
 * Gotenberg — Motor principal de conversão DOCX → PDF (Open Source)
 *
 * Em produção (Vercel), conecta a uma instância Gotenberg externa
 * hospedada em Render/Koyeb/Fly.io (gratuito).
 * Em dev, tenta localhost:3010 se estiver rodando.
 *
 * Variável de ambiente: GOTENBERG_URL
 * Exemplo: https://gotenberg-tcs.onrender.com
 */

const DEFAULT_GOTENBERG_URL = "http://localhost:3010";
const LOCAL_CONNECT_TIMEOUT_MS = 1500;
const CONVERSION_TIMEOUT_MS = 30000; // 30s — seguro p/ Vercel (limite 60s)

export type GotenbergResult = {
  pdf: Buffer;
  engine: "gotenberg";
} | null;

export type GotenbergHealthStatus = {
  online: boolean;
  url: string;
  latencyMs: number;
  error?: string;
};

/**
 * Converte DOCX para PDF usando o Gotenberg.
 * Retorna null se o serviço não estiver configurado ou indisponível,
 * sem lançar exceções — o caller decide o fallback.
 */
export async function convertDocxToPdfWithGotenberg(docxBuffer: Buffer): Promise<Buffer | null> {
  const baseUrl = resolveGotenbergUrl();
  if (!baseUrl) return null;

  const parsedUrl = new URL(baseUrl);
  if (isLocalHost(parsedUrl.hostname) && !await canConnect(parsedUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONVERSION_TIMEOUT_MS);

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
      const errorText = await response.text().catch(() => "");
      console.warn(`[Gotenberg] falha ao converter DOCX: HTTP ${response.status}`, errorText);
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      console.warn("[Gotenberg] timeout — conversao excedeu o limite de tempo.");
    } else {
      console.warn("[Gotenberg] conversor indisponivel:", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Health-check do Gotenberg.
 * Útil para pings automáticos (Cron-job.org) e para o frontend
 * exibir o status do serviço de conversão.
 */
export async function checkGotenbergHealth(): Promise<GotenbergHealthStatus> {
  const baseUrl = resolveGotenbergUrl();
  if (!baseUrl) {
    return { online: false, url: "", latencyMs: 0, error: "GOTENBERG_URL nao configurada." };
  }

  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;
    if (response.ok) {
      return { online: true, url: baseUrl, latencyMs };
    }

    return {
      online: false,
      url: baseUrl,
      latencyMs,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      online: false,
      url: baseUrl,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resolve a URL do Gotenberg a partir das variáveis de ambiente.
 * Em produção, GOTENBERG_URL DEVE estar configurada.
 * Em dev, faz fallback para localhost:3010.
 */
function resolveGotenbergUrl(): string {
  const configured = process.env.GOTENBERG_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // Em produção sem URL configurada = serviço indisponível
  if (process.env.NODE_ENV === "production") return "";

  // Em dev, tenta localhost
  return DEFAULT_GOTENBERG_URL;
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
