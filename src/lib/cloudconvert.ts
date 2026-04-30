const CLOUDCONVERT_API_BASE = "https://api.cloudconvert.com/v2";

type TaskStatus = "waiting" | "processing" | "finished" | "error";

type CloudConvertTask = {
  id: string;
  name: string;
  operation: string;
  status: TaskStatus;
  message?: string;
  result?: {
    form?: {
      url: string;
      parameters: Record<string, string>;
    };
    files?: Array<{ url: string; filename: string }>;
  };
};

type CloudConvertJob = {
  id: string;
  status: TaskStatus;
  tasks: CloudConvertTask[];
};

type JobApiResponse = { data: CloudConvertJob };

export function isCloudConvertAvailable() {
  return Boolean(process.env.CLOUDCONVERT_API_KEY);
}

export async function convertDocxToPdfWithCloudConvert(docxBuffer: Buffer): Promise<Buffer | null> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) return null;

  try {
    const jobResponse = await cloudConvertFetch(apiKey, "POST", "/jobs", {
      tasks: {
        "upload-docx": {
          operation: "import/upload",
        },
        "convert-to-pdf": {
          operation: "convert",
          input: "upload-docx",
          input_format: "docx",
          output_format: "pdf",
          engine: "libreoffice",
        },
        "export-pdf": {
          operation: "export/url",
          input: "convert-to-pdf",
          inline: false,
          archive_multiple_files: false,
        },
      },
    });

    if (!jobResponse.ok) {
      console.warn("[CloudConvert] falha ao criar job:", jobResponse.status, await jobResponse.text());
      return null;
    }

    const { data: job } = await jobResponse.json() as JobApiResponse;

    const uploadTask = job.tasks.find((t) => t.name === "upload-docx");
    if (!uploadTask?.result?.form) {
      console.warn("[CloudConvert] task de upload sem form URL na resposta");
      return null;
    }

    const { url: formUrl, parameters: formParams } = uploadTask.result.form;

    const formData = new FormData();
    for (const [key, value] of Object.entries(formParams)) {
      formData.append(key, value);
    }
    const docxArrayBuffer = docxBuffer.buffer.slice(
      docxBuffer.byteOffset,
      docxBuffer.byteOffset + docxBuffer.byteLength,
    ) as ArrayBuffer;
    formData.append(
      "file",
      new Blob([docxArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "template.docx",
    );

    const uploadResponse = await fetch(formUrl, { method: "POST", body: formData });
    if (!uploadResponse.ok && uploadResponse.status !== 204) {
      console.warn("[CloudConvert] falha no upload:", uploadResponse.status, await uploadResponse.text());
      return null;
    }

    const finishedJob = await pollUntilDone(apiKey, job.id);
    if (!finishedJob || finishedJob.status === "error") {
      const errTask = finishedJob?.tasks.find((t) => t.status === "error");
      console.warn("[CloudConvert] job falhou:", errTask?.message ?? "erro desconhecido");
      return null;
    }

    const exportTask = finishedJob.tasks.find((t) => t.name === "export-pdf");
    const downloadUrl = exportTask?.result?.files?.[0]?.url;
    if (!downloadUrl) {
      console.warn("[CloudConvert] URL de download não encontrada na resposta");
      return null;
    }

    const downloadResponse = await fetch(downloadUrl);
    if (!downloadResponse.ok) {
      console.warn("[CloudConvert] falha ao baixar PDF:", downloadResponse.status);
      return null;
    }

    return Buffer.from(await downloadResponse.arrayBuffer());
  } catch (error) {
    console.warn("[CloudConvert] erro inesperado:", error);
    return null;
  }
}

async function pollUntilDone(apiKey: string, jobId: string): Promise<CloudConvertJob | null> {
  const maxAttempts = 40;
  const delays = [1000, 1500, 2000, 2000, 3000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = delays[Math.min(attempt - 1, delays.length - 1)];
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await cloudConvertFetch(apiKey, "GET", `/jobs/${jobId}`);
      if (!response.ok) continue;

      const { data: job } = await response.json() as JobApiResponse;
      if (job.status === "finished" || job.status === "error") return job;
    } catch {
      // retry on transient network errors
    }
  }

  console.warn("[CloudConvert] timeout aguardando conclusão do job:", jobId);
  return null;
}

function cloudConvertFetch(apiKey: string, method: string, path: string, body?: unknown) {
  return fetch(`${CLOUDCONVERT_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
