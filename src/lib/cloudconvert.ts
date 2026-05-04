const DEFAULT_CLOUDCONVERT_API_URL = "https://api.cloudconvert.com/v2";
const DEFAULT_CLOUDCONVERT_SYNC_API_URL = "https://sync.api.cloudconvert.com/v2";
const DEFAULT_CLOUDCONVERT_ENGINE = "libreoffice";
const DEFAULT_CLOUDCONVERT_TIMEOUT_MS = 55000;

type CloudConvertTask = {
  id: string;
  name: string;
  operation: string;
  status: string;
  message?: string | null;
  code?: string | null;
  result?: {
    form?: {
      url: string;
      parameters: Record<string, string | number | boolean>;
    };
    files?: Array<{
      filename: string;
      url?: string;
    }>;
  };
};

type CloudConvertJob = {
  id: string;
  status: string;
  tasks: CloudConvertTask[];
};

type CloudConvertResponse<T> = {
  data: T;
};

export async function convertDocxToPdfWithCloudConvert(docxBuffer: Buffer): Promise<Buffer | null> {
  const config = getCloudConvertConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const job = await createCloudConvertJob(config, controller.signal);
    const uploadTask = findTask(job, "import-docx");
    await uploadDocxToCloudConvert(uploadTask, docxBuffer, controller.signal);

    const finishedJob = await waitForCloudConvertJob(config, job.id, controller.signal);
    if (finishedJob.status !== "finished") {
      console.warn("[CloudConvert] job nao finalizado:", describeCloudConvertFailure(finishedJob));
      return null;
    }

    const exportTask = findTask(finishedJob, "export-pdf");
    const fileUrl = exportTask.result?.files?.[0]?.url;
    if (!fileUrl) {
      console.warn("[CloudConvert] URL de exportacao ausente.");
      return null;
    }

    const response = await fetch(fileUrl, { signal: controller.signal });
    if (!response.ok) {
      console.warn("[CloudConvert] falha ao baixar PDF:", response.status, await response.text());
      return null;
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn("[CloudConvert] conversor indisponivel:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getCloudConvertConfig() {
  const apiKey = process.env.CLOUDCONVERT_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    apiUrl: normalizeBaseUrl(process.env.CLOUDCONVERT_API_BASE_URL || DEFAULT_CLOUDCONVERT_API_URL),
    syncApiUrl: normalizeBaseUrl(process.env.CLOUDCONVERT_SYNC_API_BASE_URL || DEFAULT_CLOUDCONVERT_SYNC_API_URL),
    engine: process.env.CLOUDCONVERT_ENGINE?.trim() || DEFAULT_CLOUDCONVERT_ENGINE,
    timeoutMs: parsePositiveInteger(process.env.CLOUDCONVERT_TIMEOUT_MS, DEFAULT_CLOUDCONVERT_TIMEOUT_MS),
  };
}

async function createCloudConvertJob(
  config: NonNullable<ReturnType<typeof getCloudConvertConfig>>,
  signal: AbortSignal,
) {
  const response = await cloudConvertFetch<CloudConvertJob>(config, `${config.apiUrl}/jobs`, {
    method: "POST",
    body: JSON.stringify({
      tasks: {
        "import-docx": {
          operation: "import/upload",
        },
        "convert-docx": {
          operation: "convert",
          input: "import-docx",
          input_format: "docx",
          output_format: "pdf",
          engine: config.engine,
          filename: "certificate.pdf",
          timeout: Math.max(10, Math.ceil(config.timeoutMs / 1000)),
        },
        "export-pdf": {
          operation: "export/url",
          input: "convert-docx",
        },
      },
    }),
    signal,
  });

  return response.data;
}

async function uploadDocxToCloudConvert(task: CloudConvertTask, docxBuffer: Buffer, signal: AbortSignal) {
  const form = task.result?.form;
  if (!form?.url) throw new Error("CloudConvert nao retornou formulario de upload.");

  const formData = new FormData();
  for (const [key, value] of Object.entries(form.parameters ?? {})) {
    formData.append(key, String(value));
  }
  formData.append(
    "file",
    new Blob([bufferToArrayBuffer(docxBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "certificate.docx",
  );

  const response = await fetch(form.url, {
    method: "POST",
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`CloudConvert recusou upload: HTTP ${response.status} ${await response.text()}`);
  }
}

async function waitForCloudConvertJob(
  config: NonNullable<ReturnType<typeof getCloudConvertConfig>>,
  jobId: string,
  signal: AbortSignal,
) {
  const response = await cloudConvertFetch<CloudConvertJob>(config, `${config.syncApiUrl}/jobs/${jobId}`, {
    method: "GET",
    signal,
  });

  return response.data;
}

async function cloudConvertFetch<T>(
  config: NonNullable<ReturnType<typeof getCloudConvertConfig>>,
  url: string,
  init: RequestInit,
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`CloudConvert HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json() as CloudConvertResponse<T>;
}

function findTask(job: CloudConvertJob, name: string) {
  const task = job.tasks.find((candidate) => candidate.name === name);
  if (!task) throw new Error(`CloudConvert nao retornou a task ${name}.`);
  return task;
}

function describeCloudConvertFailure(job: CloudConvertJob) {
  const failedTask = job.tasks.find((task) => task.status === "error");
  if (!failedTask) return `status=${job.status}`;

  return [
    `status=${job.status}`,
    `task=${failedTask.name}`,
    failedTask.code ? `code=${failedTask.code}` : "",
    failedTask.message ? `message=${failedTask.message}` : "",
  ].filter(Boolean).join(" ");
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
