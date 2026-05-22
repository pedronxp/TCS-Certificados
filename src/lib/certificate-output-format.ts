import { templateLayoutSchema, type TemplateLayout } from "@/lib/certificate-layout";
import { PDFDocument } from "pdf-lib";

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

export async function shouldRegenerateCertificateFile(
  type: CertificateFileType,
  layout: unknown,
  content: Buffer,
) {
  if (type !== "PDF") return false;
  if (!content.subarray(0, 4).equals(Buffer.from("%PDF"))) return true;

  const parsed = templateLayoutSchema.safeParse(layout);
  if (!parsed.success || !isOfficeBaseLayout(parsed.data)) return false;

  const pdfInfo = await getPdfInfo(content);
  if (!pdfInfo) return true;

  const expectedPageCount = getExpectedPdfPageCount(parsed.data);
  if (pdfInfo.pageCount !== expectedPageCount) return true;
  if (!await hasExtractablePdfText(content)) return true;

  return !pdfFirstPageMatchesLayout(pdfInfo, parsed.data);
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

function getExpectedPdfPageCount(layout: TemplateLayout) {
  const basePageCount = layout.basePages?.length ?? 0;
  const elementPageCount = Math.max(0, ...layout.elements.map((element) => element.pageIndex ?? 0)) + 1;

  return Math.max(1, basePageCount, elementPageCount);
}

async function getPdfInfo(pdfBuffer: Buffer) {
  try {
    const pdf = await PDFDocument.load(pdfBuffer);
    const firstPage = pdf.getPage(0);
    return {
      pageCount: pdf.getPageCount(),
      firstPageSize: firstPage.getSize(),
    };
  } catch {
    return null;
  }
}

async function hasExtractablePdfText(pdfBuffer: Buffer) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item) => ("str" in item ? item.str : "")).join("").trim();
      if (text) return true;
    }

    return false;
  } catch {
    return true;
  }
}

function pdfFirstPageMatchesLayout(
  info: NonNullable<Awaited<ReturnType<typeof getPdfInfo>>>,
  layout: TemplateLayout,
) {
  const expectedPage = layout.basePages?.[0];
  const expectedWidth = expectedPage?.width || 1123;
  const expectedHeight = expectedPage?.height || 794;
  const { width, height } = info.firstPageSize;

  return (
    dimensionsAreClose(width, height, expectedWidth, expectedHeight) ||
    dimensionsAreClose(width * 4 / 3, height * 4 / 3, expectedWidth, expectedHeight)
  );
}

function dimensionsAreClose(width: number, height: number, expectedWidth: number, expectedHeight: number) {
  return relativeDifference(width, expectedWidth) <= 0.03 && relativeDifference(height, expectedHeight) <= 0.03;
}

function relativeDifference(value: number, expected: number) {
  if (!Number.isFinite(value) || !Number.isFinite(expected) || expected <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(value - expected) / expected;
}
