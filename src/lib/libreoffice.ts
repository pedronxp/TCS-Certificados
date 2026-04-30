import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

const COMMON_WINDOWS_PATHS = [
  "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
];

let cachedExecutable: string | null | undefined;

export async function convertDocxToPdfBuffer(docxBuffer: Buffer) {
  const executable = await findLibreOfficeExecutable();
  if (!executable) return null;

  const tempDir = path.join(os.tmpdir(), `tcs-docx-${randomUUID()}`);
  const inputPath = path.join(tempDir, "input.docx");
  const outputPath = path.join(tempDir, "input.pdf");

  await mkdir(tempDir, { recursive: true });

  try {
    await writeFile(inputPath, docxBuffer);
    await execFileAsync(executable, [
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      "--convert-to",
      "pdf",
      "--outdir",
      tempDir,
      inputPath,
    ], {
      timeout: 60000,
      windowsHide: true,
    });

    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function findLibreOfficeExecutable() {
  if (cachedExecutable !== undefined) return cachedExecutable;

  const configured = process.env.LIBREOFFICE_PATH;
  if (configured && await fileExists(configured)) {
    cachedExecutable = configured;
    return cachedExecutable;
  }

  for (const candidate of COMMON_WINDOWS_PATHS) {
    if (await fileExists(candidate)) {
      cachedExecutable = candidate;
      return cachedExecutable;
    }
  }

  for (const command of process.platform === "win32" ? ["soffice.exe", "soffice"] : ["soffice", "libreoffice"]) {
    const resolved = await resolveCommand(command);
    if (resolved) {
      cachedExecutable = resolved;
      return cachedExecutable;
    }
  }

  cachedExecutable = null;
  return cachedExecutable;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommand(command: string) {
  const lookupCommand = process.platform === "win32" ? "where.exe" : "which";

  try {
    const { stdout } = await execFileAsync(lookupCommand, [command], {
      timeout: 5000,
      windowsHide: true,
    });
    const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}
