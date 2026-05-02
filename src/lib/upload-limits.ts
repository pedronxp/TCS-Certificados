export const MAX_TEMPLATE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_BATCH_ROWS = 500;

export function validateFileSize(file: File, maxBytes: number) {
  if (file.size <= maxBytes) return null;
  return `Arquivo muito grande. Envie um arquivo de ate ${formatBytes(maxBytes)}.`;
}

export function validateBatchSpreadsheetFile(file: File) {
  const sizeError = validateFileSize(file, MAX_BATCH_UPLOAD_BYTES);
  if (sizeError) return sizeError;

  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".xlsx")) return null;

  return "Envie uma planilha CSV ou XLSX valida.";
}

export function validateDocxFile(file: File) {
  const sizeError = validateFileSize(file, MAX_TEMPLATE_UPLOAD_BYTES);
  if (sizeError) return sizeError;

  if (file.name.toLowerCase().endsWith(".docx") || file.type.includes("wordprocessingml")) {
    return null;
  }

  return "Envie um arquivo DOCX valido.";
}

export function validateTemplateImportFile(file: File) {
  const sizeError = validateFileSize(file, MAX_TEMPLATE_UPLOAD_BYTES);
  if (sizeError) return sizeError;

  const name = file.name.toLowerCase();
  const allowedByName = [".docx", ".pdf", ".png", ".jpg", ".jpeg"].some((extension) =>
    name.endsWith(extension),
  );
  const allowedByType =
    file.type.includes("wordprocessingml") ||
    file.type === "application/pdf" ||
    file.type.startsWith("image/");

  return allowedByName || allowedByType
    ? null
    : "Envie um modelo DOCX, PDF ou imagem valido.";
}

export function validateBatchRowCount(total: number) {
  if (total <= MAX_BATCH_ROWS) return null;
  return `O lote pode ter no maximo ${MAX_BATCH_ROWS} linhas por envio.`;
}

function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}
