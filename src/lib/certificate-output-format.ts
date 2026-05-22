import { templateLayoutSchema, type TemplateLayout } from "@/lib/certificate-layout";

export type NativeCertificateFileType = "DOCX" | "PPTX";
export type CertificateFileType = "PDF" | NativeCertificateFileType;
export type CertificateOutputMode = "EDITABLE" | "NON_EDITABLE";

export const DEFAULT_CERTIFICATE_OUTPUT_MODE: CertificateOutputMode = "EDITABLE";
export const NON_EDITABLE_NATIVE_DOWNLOAD_ERROR =
  "Este certificado foi gerado como versao nao editavel. Baixe o PDF final.";

export function getTemplateNativeFileType(layout: unknown): NativeCertificateFileType {
  const parsed = templateLayoutSchema.safeParse(layout);
  if (!parsed.success) return "DOCX";

  const templateLayout = parsed.data;
  if (isPptxBaseLayout(templateLayout)) return "PPTX";

  return "DOCX";
}

export function isOfficeBaseLayout(layout: unknown) {
  const parsed = templateLayoutSchema.safeParse(layout);
  if (!parsed.success) return false;

  const templateLayout = parsed.data;
  return isPptxBaseLayout(templateLayout) || isDocxBaseLayout(templateLayout);
}

export function certificateFileExtension(type: CertificateFileType) {
  return type.toLowerCase();
}

export function certificateFileMimeType(type: CertificateFileType) {
  if (type === "PDF") return "application/pdf";
  if (type === "PPTX") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function normalizeCertificateFileType(type: string | null | undefined): CertificateFileType {
  const upperType = String(type ?? "").toUpperCase();
  if (upperType === "DOCX" || upperType === "PPTX") return upperType;
  return "PDF";
}

export function normalizeCertificateOutputMode(mode: unknown): CertificateOutputMode {
  const upperMode = String(mode ?? "").trim().toUpperCase();
  return upperMode === "NON_EDITABLE" ? "NON_EDITABLE" : DEFAULT_CERTIFICATE_OUTPUT_MODE;
}

export function canDownloadCertificateFile(
  outputMode: CertificateOutputMode | null | undefined,
  type: CertificateFileType,
) {
  return normalizeCertificateOutputMode(outputMode) !== "NON_EDITABLE" || type === "PDF";
}

export function isNonEditableCertificateOutputMode(outputMode: CertificateOutputMode | null | undefined) {
  return normalizeCertificateOutputMode(outputMode) === "NON_EDITABLE";
}

export function certificateOutputModeLabel(outputMode: CertificateOutputMode | null | undefined) {
  return isNonEditableCertificateOutputMode(outputMode)
    ? "PDF final nao editavel"
    : "PDF + arquivo editavel";
}

function isDocxBaseLayout(layout: TemplateLayout) {
  if (layout.baseDocumentMode === "editable" || !layout.baseFileDataUrl) return false;

  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl.toLowerCase();

  return (
    fileType.includes("wordprocessingml") ||
    fileName.endsWith(".docx") ||
    dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml")
  );
}

function isPptxBaseLayout(layout: TemplateLayout) {
  if (layout.baseDocumentMode === "editable" || !layout.baseFileDataUrl) return false;

  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl.toLowerCase();

  return (
    fileType.includes("presentationml") ||
    fileName.endsWith(".pptx") ||
    dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.presentationml")
  );
}
