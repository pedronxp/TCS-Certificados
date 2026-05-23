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

type CloudConvertOfficeInput = {
  buffer: Buffer;
  inputFormat: string;
  fileName?: string;
  mimeType?: string;
  engine?: string;
};

type NormalizedCloudConvertOfficeInput = Required<Omit<CloudConvertOfficeInput, "engine">> & {
  engine?: string;
};

type CloudConvertConfig = {
  apiKey: string;
  apiUrl: string;
  syncApiUrl: string;
  engine: string;
  timeoutMs: number;
};

export async function convertDocxToPdfWithCloudConvert(docxBuffer: Buffer): Promise<Buffer | null> {
  return convertOfficeToPdfWithCloudConvert({
    buffer: docxBuffer,
    inputFormat: "docx",
    fileName: "certificate.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export async function convertOfficeToPdfWithCloudConvert(input: CloudConvertOfficeInput): Promise<Buffer | null> {
  const configs = getCloudConvertConfigs();
  if (!configs.length) return null;

  const normalizedInput = normalizeOfficeInput(input);
  const failures: string[] = [];

  for (const config of configs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const job = await createCloudConvertJob(
        config,
        normalizedInput.inputFormat,
        normalizedInput.engine || config.engine,
        controller.signal,
      );
      const uploadTask = findTask(job, importTaskName(normalizedInput.inputFormat));
      await uploadOfficeFileToCloudConvert(uploadTask, normalizedInput, controller.signal);

      const finishedJob = await waitForCloudConvertJob(config, job.id, controller.signal);
      if (finishedJob.status !== "finished") {
        failures.push(describeCloudConvertFailure(finishedJob));
        continue;
      }

      const exportTask = findTask(finishedJob, "export-pdf");
      const fileUrl = exportTask.result?.files?.[0]?.url;
      if (!fileUrl) {
        failures.push("URL de exportacao ausente");
        continue;
      }

      const response = await fetch(fileUrl, { signal: controller.signal });
      if (!response.ok) {
        failures.push(`falha ao baixar PDF: HTTP ${response.status} ${await response.text()}`);
        continue;
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      failures.push(describeError(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (failures.length) {
    console.warn("[CloudConvert] conversor indisponivel:", failures.join(" | "));
  }

  return null;
}

export function hasCloudConvertApiKey() {
  return getCloudConvertApiKeys().length > 0;
}

function getCloudConvertConfigs(): CloudConvertConfig[] {
  const apiKeys = getCloudConvertApiKeys();
  if (!apiKeys.length) return [];

  return apiKeys.map((apiKey) => ({
    apiKey,
    apiUrl: normalizeBaseUrl(process.env.CLOUDCONVERT_API_BASE_URL || DEFAULT_CLOUDCONVERT_API_URL),
    syncApiUrl: normalizeBaseUrl(process.env.CLOUDCONVERT_SYNC_API_BASE_URL || DEFAULT_CLOUDCONVERT_SYNC_API_URL),
    engine: process.env.CLOUDCONVERT_ENGINE?.trim() || DEFAULT_CLOUDCONVERT_ENGINE,
    timeoutMs: parsePositiveInteger(process.env.CLOUDCONVERT_TIMEOUT_MS, DEFAULT_CLOUDCONVERT_TIMEOUT_MS),
  }));
}

function getCloudConvertApiKeys() {
  const candidates = [
    process.env.CLOUDCONVERT_API_KEY,
    process.env.CLOUDCONVERT_API_KEYS,
    process.env.CLOUDCONVERT_API_KEY_1,
    process.env.CLOUDCONVERT_API_KEY_2,
    process.env.CLOUDCONVERT_API_KEY_3,
  ];

  return [...new Set(
    candidates
      .flatMap((value) => String(value ?? "").split(/[,\n]/g))
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

async function createCloudConvertJob(
  config: CloudConvertConfig,
  inputFormat: string,
  engine: string,
  signal: AbortSignal,
) {
  const importTask = importTaskName(inputFormat);
  const convertTask = convertTaskName(inputFormat);
  const response = await cloudConvertFetch<CloudConvertJob>(config, `${config.apiUrl}/jobs`, {
    method: "POST",
    body: JSON.stringify({
      tasks: {
        [importTask]: {
          operation: "import/upload",
        },
        [convertTask]: {
          operation: "convert",
          input: importTask,
          input_format: inputFormat,
          output_format: "pdf",
          engine,
          filename: "certificate.pdf",
          timeout: Math.max(10, Math.ceil(config.timeoutMs / 1000)),
        },
        "export-pdf": {
          operation: "export/url",
          input: convertTask,
        },
      },
    }),
    signal,
  });

  return response.data;
}

async function uploadOfficeFileToCloudConvert(
  task: CloudConvertTask,
  input: NormalizedCloudConvertOfficeInput,
  signal: AbortSignal,
) {
  const form = task.result?.form;
  if (!form?.url) throw new Error("CloudConvert nao retornou formulario de upload.");

  const formData = new FormData();
  for (const [key, value] of Object.entries(form.parameters ?? {})) {
    formData.append(key, String(value));
  }
  formData.append(
    "file",
    new Blob([bufferToArrayBuffer(input.buffer)], {
      type: input.mimeType,
    }),
    input.fileName,
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

function normalizeOfficeInput(input: CloudConvertOfficeInput): NormalizedCloudConvertOfficeInput {
  const inputFormat = input.inputFormat.replace(/[^a-z0-9]/gi, "").toLowerCase() || "docx";
  const fileName = input.fileName?.trim() || `certificate.${inputFormat}`;
  const mimeType = input.mimeType?.trim() || defaultOfficeMimeType(inputFormat);
  const engine = input.engine?.trim();

  return {
    buffer: input.buffer,
    inputFormat,
    fileName,
    mimeType,
    ...(engine ? { engine } : {}),
  };
}

function defaultOfficeMimeType(inputFormat: string) {
  if (inputFormat === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }

  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function importTaskName(inputFormat: string) {
  return `import-${inputFormat}`;
}

function convertTaskName(inputFormat: string) {
  return `convert-${inputFormat}`;
}

async function waitForCloudConvertJob(
  config: CloudConvertConfig,
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
  config: CloudConvertConfig,
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

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
