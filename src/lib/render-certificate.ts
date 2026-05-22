import { Document, Packer, Paragraph, TextRun } from "docx";
import Docxtemplater from "docxtemplater";
import JSZip from "jszip";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import PizZip from "pizzip";
import QRCode from "qrcode";
import { fillTemplateText, normalizeVariableKey, normalizeVisualDocxLayout, templateLayoutSchema, type TemplateLayout } from "@/lib/certificate-layout";
import {
  certificateFileExtension,
  certificateFileMimeType,
  getTemplateNativeFileType,
  type NativeCertificateFileType,
} from "@/lib/certificate-output-format";
import { convertDocxToPdfWithCloudConvert, convertOfficeToPdfWithCloudConvert as convertOfficeToPdfWithCloudConvertCloud } from "@/lib/cloudconvert";
import { buildDocxVisualPreview } from "@/lib/docx-preview-service";
import { convertDocxToPdfWithGotenberg, convertOfficeToPdfWithGotenberg } from "@/lib/gotenberg";
import { convertDocxToPdfBuffer, convertOfficeToPdfBuffer } from "@/lib/libreoffice";
import { convertDocxToPdfWithMicrosoftGraph } from "@/lib/microsoft-graph";
import { buildVerificationTemplateValues } from "@/lib/verification-code";

export const DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE =
  "Conversor Office para PDF indisponivel. Configure GOTENBERG_URL, CLOUDCONVERT_API_KEY ou LIBREOFFICE_PATH em ambiente local.";

export type RenderInput = {
  template: {
    name: string;
    width: number;
    height: number;
    background: string | null;
    layout: unknown;
  };
  values: Record<string, string>;
  verificationCode: string;
  appUrl: string;
};

export type RenderedNativeCertificate = {
  type: NativeCertificateFileType;
  extension: string;
  mimeType: string;
  buffer: Buffer;
};

export function getNativeCertificateFileType(template: RenderInput["template"]): NativeCertificateFileType {
  return getTemplateNativeFileType(template.layout);
}

export async function renderNativeCertificateBuffer(input: RenderInput): Promise<RenderedNativeCertificate> {
  const layout = parseRenderLayout(input.template.layout);

  if (isNativePptxBaseLayout(layout)) {
    const type = "PPTX" as const;
    return {
      type,
      extension: certificateFileExtension(type),
      mimeType: certificateFileMimeType(type),
      buffer: await renderPptxFromBaseTemplate(input, layout),
    };
  }

  const type = "DOCX" as const;
  return {
    type,
    extension: certificateFileExtension(type),
    mimeType: certificateFileMimeType(type),
    buffer: await renderDocxBuffer(input),
  };
}

export async function renderCertificateHtml(input: RenderInput) {
  const layout = parseRenderLayout(input.template.layout);
  const validationUrl = `${input.appUrl.replace(/\/$/, "")}/validar/${input.verificationCode}`;
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 260 });
  const values = buildRenderValues(input);

  return certificateHtml({
    layout,
    width: input.template.width,
    height: input.template.height,
    background: input.template.background,
    values,
    qrDataUrl,
    verificationCode: input.verificationCode,
  });
}

export async function renderPdfBuffer(input: RenderInput) {
  const layout = parseRenderLayout(input.template.layout);
  if (layout.baseFileType === "application/pdf" && layout.baseFileDataUrl) {
    return renderPdfFromBaseTemplate(input, layout);
  }
  if (isNativeDocxBaseLayout(layout)) {
    try {
      const nativePdf = await renderPdfFromNativeDocxBaseTemplate(input, layout);
      if (nativePdf) return nativePdf;
    } catch (error) {
      if (!hasRenderableVisualPdfFallback(layout)) throw error;
      console.warn("Conversao DOCX para PDF falhou; usando fallback visual do modelo.");
    }

    if (hasRenderableVisualPdfFallback(layout)) {
      return renderPdfFromVisualBaseTemplate(input, layout);
    }

    throw new Error(DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE);
  }
  if (isNativePptxBaseLayout(layout)) {
    try {
      const nativePdf = await renderPdfFromNativePptxBaseTemplate(input, layout);
      if (nativePdf) return nativePdf;
    } catch (error) {
      if (!hasRenderableVisualPdfFallback(layout)) throw error;
      console.warn("Conversao PPTX para PDF falhou; usando fallback visual do modelo.");
    }

    if (hasRenderableVisualPdfFallback(layout)) {
      return renderPdfFromVisualBaseTemplate(input, layout);
    }

    throw new Error(DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE);
  }

  try {
    const html = await renderCertificateHtml(input);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        viewport: { width: input.template.width, height: input.template.height },
      });
      await page.setContent(html, { waitUntil: "networkidle" });
      const pdf = await page.pdf({
        width: `${input.template.width}px`,
        height: `${input.template.height}px`,
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.warn("Playwright indisponível; usando fallback pdf-lib.", error);
    return renderPdfFallback(input, layout);
  }
}

export async function renderDocxBuffer(input: RenderInput) {
  const layout = parseRenderLayout(input.template.layout);
  if (isNativeDocxBaseLayout(layout)) {
    return renderDocxFromBaseTemplate(input, layout);
  }
  if (isNativePptxBaseLayout(layout)) {
    return renderDocxFromNativePptxBaseTemplate(input, layout);
  }
  const values = buildRenderValues(input);

  const lines = layout.elements
    .filter((element) => element.type !== "image" && element.type !== "qr")
    .map((element) =>
      element.type === "variable" && element.variableKey
        ? values[element.variableKey] ?? ""
        : fillTemplateText(element.content, values),
    )
    .filter(Boolean);

  const document = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: input.template.name,
                bold: true,
                size: 36,
              }),
            ],
          }),
          ...lines.map(
            (line) =>
              new Paragraph({
                children: [new TextRun({ text: line, size: 28 })],
                spacing: { before: 180 },
              }),
          ),
          new Paragraph({
            children: [
              new TextRun({
                text: `Código de validação: ${input.verificationCode}`,
                size: 20,
              }),
            ],
            spacing: { before: 400 },
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

export async function renderPptxBuffer(input: RenderInput) {
  const layout = parseRenderLayout(input.template.layout);
  if (!isNativePptxBaseLayout(layout)) {
    throw new Error("O modelo deste certificado nao possui base PPTX nativa.");
  }

  return renderPptxFromBaseTemplate(input, layout);
}

async function renderPdfFromBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const pdfDocument = await PDFDocument.load(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  const fonts = await embedPdfFonts(pdfDocument);
  const validationUrl = `${input.appUrl.replace(/\/$/, "")}/validar/${input.verificationCode}`;
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 260 });
  const qrImage = await pdfDocument.embedPng(dataUrlToBuffer(qrDataUrl));
  const values = buildRenderValues(input);

  for (const element of sortElementsForRender(layout.elements)) {
    const pageIndex = Math.min(Math.max(element.pageIndex ?? 0, 0), pdfDocument.getPageCount() - 1);
    const page = pdfDocument.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = (element.x / input.template.width) * pageWidth;
    const yFromTop = (element.y / input.template.height) * pageHeight;
    const elementWidth = (element.width / input.template.width) * pageWidth;
    const elementHeight = (element.height / input.template.height) * pageHeight;
    const fontSize = (element.fontSize / input.template.height) * pageHeight;

    if (element.type === "qr") {
      page.drawImage(qrImage, {
        x,
        y: pageHeight - yFromTop - elementHeight,
        width: Math.min(elementWidth, elementHeight),
        height: Math.min(elementWidth, elementHeight),
      });
      continue;
    }

    if (element.type === "image") continue;

    drawPdfTextElement(page, {
      text: resolveElementText(element, values),
      x,
      topY: pageHeight - yFromTop,
      width: elementWidth,
      height: elementHeight,
      fontSize,
      element,
      fonts,
    });
  }

  return Buffer.from(await pdfDocument.save());
}

async function renderPdfFromNativeDocxBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const docxBuffer = renderDocxFromBaseTemplate(input, layout);
  const expectedPageCount = getExpectedPdfPageCount(layout);
  const nativePdf = await convertDocxToPdfWithFallbacks(docxBuffer);

  if (nativePdf) {
    const nativeInfo = await getPdfInfo(nativePdf);
    if (!nativeInfo) return nativePdf;

    if (
      nativeInfo.pageCount === expectedPageCount &&
      pdfFirstPageMatchesTemplateSize(nativeInfo, input.template.width, input.template.height, layout)
    ) {
      return nativePdf;
    }

    if (
      nativeInfo.pageCount > expectedPageCount &&
      pdfFirstPageMatchesTemplateSize(nativeInfo, input.template.width, input.template.height, layout) &&
      await hasOnlyValidationOverflowPages(nativePdf, expectedPageCount, input.verificationCode)
    ) {
      return trimNativePdfValidationOverflow(nativePdf, expectedPageCount, input.verificationCode);
    }
  }

  const visualPdf = await renderPdfFromRenderedNativeDocxVisualTemplate(input, layout, docxBuffer);
  return visualPdf ?? nativePdf;
}

async function convertDocxToPdfWithFallbacks(docxBuffer: Buffer) {
  const gotenbergPdf = await convertDocxToPdfWithGotenberg(docxBuffer);
  if (gotenbergPdf) return Buffer.from(gotenbergPdf);

  const libreOfficePdf = await convertDocxToPdfBuffer(docxBuffer);
  if (libreOfficePdf) return Buffer.from(libreOfficePdf);

  const cloudConvertPdf = await convertDocxToPdfWithCloudConvert(docxBuffer);
  if (cloudConvertPdf) return Buffer.from(cloudConvertPdf);

  const graphPdf = await convertDocxToPdfWithMicrosoftGraph(docxBuffer);
  if (graphPdf) return Buffer.from(graphPdf);

  return null;
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

function pdfFirstPageMatchesTemplateSize(
  info: NonNullable<Awaited<ReturnType<typeof getPdfInfo>>>,
  templateWidth: number,
  templateHeight: number,
  layout: TemplateLayout,
) {
  const expectedPage = layout.basePages?.[0];
  const expectedWidth = expectedPage?.width || templateWidth;
  const expectedHeight = expectedPage?.height || templateHeight;
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

async function hasOnlyValidationOverflowPages(
  pdfBuffer: Buffer,
  expectedPageCount: number,
  verificationCode: string,
) {
  const texts = await extractPdfPageTexts(pdfBuffer);
  if (texts.length <= expectedPageCount) return false;

  const overflowTexts = texts.slice(expectedPageCount);
  return overflowTexts.every((text) => {
    const normalized = normalizePdfText(text);
    return (
      normalized.includes(normalizePdfText(verificationCode)) &&
      normalized.includes("certificado valido") &&
      normalized.includes("cpf") &&
      normalized.includes("aluno") &&
      normalized.length <= 220
    );
  });
}

async function extractPdfPageTexts(pdfBuffer: Buffer) {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(pdfBuffer);
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push(textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }

    return pages;
  } catch {
    return [];
  }
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function trimNativePdfValidationOverflow(
  pdfBuffer: Buffer,
  expectedPageCount: number,
  verificationCode: string,
) {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const outputPdf = await PDFDocument.create();
  const copiedPages = await outputPdf.copyPages(
    sourcePdf,
    Array.from({ length: expectedPageCount }, (_, index) => index),
  );

  for (const page of copiedPages) outputPdf.addPage(page);

  drawValidationFooter(outputPdf, outputPdf.getPage(expectedPageCount - 1), verificationCode);

  return Buffer.from(await outputPdf.save());
}

function drawValidationFooter(pdfDocument: PDFDocument, page: PDFPage, verificationCode: string) {
  const { width } = page.getSize();
  const fontSize = 9;
  const firstLine = "Certificado válido apenas com a assinatura e CPF do aluno.";
  const secondLine = `Numeração:${verificationCode}`;
  const font = pdfDocument.embedStandardFont(StandardFonts.Helvetica);

  page.drawText(firstLine, {
    x: (width - font.widthOfTextAtSize(firstLine, fontSize)) / 2,
    y: 52,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(secondLine, {
    x: (width - font.widthOfTextAtSize(secondLine, fontSize)) / 2,
    y: 40,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

async function renderPdfFromNativePptxBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const pptxBuffer = await renderPptxFromBaseTemplate(input, layout);
  return convertNativePptxToPdfBuffer(pptxBuffer, layout, {
    preferCloudConvertOffice: true,
  });
}

async function renderPdfFromRenderedNativeDocxVisualTemplate(
  input: RenderInput,
  layout: TemplateLayout,
  docxBuffer: Buffer,
) {
  try {
    const preview = await buildDocxVisualPreview(docxBuffer);
    const pages = preview.pages
      .filter((page) => Boolean(page.imageDataUrl))
      .map((page) => ({ ...page, border: undefined }));
    if (!pages.length) return null;

    return renderPdfFromVisualBaseTemplate(input, {
      ...layout,
      basePages: pages,
      baseImageDataUrl: pages[0]?.imageDataUrl,
      baseRenderDataUrl: pages[0]?.imageDataUrl,
      baseRenderFileType: "image/png",
      baseRenderEngine: preview.imageEngine,
      basePageBorder: undefined,
    });
  } catch (error) {
    console.warn("Fallback visual do DOCX preenchido indisponivel; usando alternativas estaticas.", error);
    return null;
  }
}

async function renderPdfFallback(input: RenderInput, layout: TemplateLayout) {
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([input.template.width, input.template.height]);
  const fonts = await embedPdfFonts(pdfDocument);
  const validationUrl = `${input.appUrl.replace(/\/$/, "")}/validar/${input.verificationCode}`;
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 260 });
  const qrImage = await pdfDocument.embedPng(dataUrlToBuffer(qrDataUrl));
  const values = buildRenderValues(input);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: input.template.width,
    height: input.template.height,
    color: rgb(0.97, 0.98, 1),
  });
  page.drawRectangle({
    x: 24,
    y: 24,
    width: input.template.width - 48,
    height: input.template.height - 48,
    borderColor: rgb(0.06, 0.46, 0.43),
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 38,
    y: 38,
    width: input.template.width - 76,
    height: input.template.height - 76,
    borderColor: rgb(0.58, 0.64, 0.72),
    borderWidth: 1,
  });

  for (const element of sortElementsForRender(layout.elements)) {
    if (element.type === "qr") {
      page.drawImage(qrImage, {
        x: element.x,
        y: input.template.height - element.y - element.height,
        width: Math.min(element.width, element.height),
        height: Math.min(element.width, element.height),
      });
      continue;
    }

    if (element.type === "image") continue;

    drawPdfTextElement(page, {
      text: resolveElementText(element, values),
      x: element.x,
      topY: input.template.height - element.y,
      width: element.width,
      height: element.height,
      fontSize: element.fontSize,
      element,
      fonts,
    });
  }

  return Buffer.from(await pdfDocument.save());
}

async function renderPdfFromVisualBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const pdfDocument = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdfDocument);
  const validationUrl = `${input.appUrl.replace(/\/$/, "")}/validar/${input.verificationCode}`;
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 260 });
  const qrImage = await pdfDocument.embedPng(dataUrlToBuffer(qrDataUrl));
  const values = buildRenderValues(input);
  const pages = buildRenderPages(layout, input.template.width, input.template.height, input.template.background);

  for (const pageInfo of pages) {
    const page = pdfDocument.addPage([pageInfo.width, pageInfo.height]);

    if (pageInfo.background) {
      const backgroundImage = await embedPdfDataUrlImage(pdfDocument, pageInfo.background);
      page.drawImage(backgroundImage, {
        x: 0,
        y: 0,
        width: pageInfo.width,
        height: pageInfo.height,
      });
    }

    if (pageInfo.border) {
      page.drawRectangle({
        x: pageInfo.border.inset,
        y: pageInfo.border.inset,
        width: pageInfo.width - pageInfo.border.inset * 2,
        height: pageInfo.height - pageInfo.border.inset * 2,
        borderColor: hexToRgb(pageInfo.border.color),
        borderWidth: pageInfo.border.width,
      });
    }

    for (const element of sortElementsForRender(layout.elements)) {
      if ((element.pageIndex ?? 0) !== pageInfo.index) continue;

      if (element.type === "qr") {
        page.drawImage(qrImage, {
          x: element.x,
          y: pageInfo.height - element.y - element.height,
          width: Math.min(element.width, element.height),
          height: Math.min(element.width, element.height),
        });
        continue;
      }

      if (element.type === "image") {
        if (!element.content) continue;
        const image = await embedPdfDataUrlImage(pdfDocument, element.content);
        page.drawImage(image, {
          x: element.x,
          y: pageInfo.height - element.y - element.height,
          width: element.width,
          height: element.height,
          opacity: resolveImageOpacity(element),
        });
        continue;
      }

      drawPdfTextElement(page, {
        text: resolveElementText(element, values),
        x: element.x,
        topY: pageInfo.height - element.y,
        width: element.width,
        height: element.height,
        fontSize: element.fontSize,
        element,
        fonts,
      });
    }
  }

  return Buffer.from(await pdfDocument.save());
}

function renderDocxFromBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const zip = new PizZip(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  applyDocxAssetReplacementsToZip(zip, layout);
  const sourceText = [
    layout.basePreviewHtml ?? "",
    zip.file("word/document.xml")?.asText() ?? "",
  ].join("\n");
  const values = expandTemplateValues(buildRenderValues(input), sourceText);
  const document = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: (part) => {
      const originalKey = String(part.value ?? "").trim();
      const normalizedKey = normalizeVariableKey(originalKey);
      return values[originalKey] ?? values[normalizedKey] ?? "";
    },
  });

  document.render(values);

  return Buffer.from(document.getZip().generate({ type: "nodebuffer" }));
}

async function renderDocxFromNativePptxBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const pptxBuffer = await renderPptxFromBaseTemplate(input, layout);
  const zip = await JSZip.loadAsync(pptxBuffer);
  const lines = await extractPptxPlainTextLines(zip);
  const hasVerificationCode = lines.some((line) => line.includes(input.verificationCode));
  const children = [
    new Paragraph({
      children: [
        new TextRun({
          text: input.template.name,
          bold: true,
          size: 36,
        }),
      ],
    }),
    ...lines.map((line) =>
      new Paragraph({
        children: [new TextRun({ text: line, size: 24 })],
        spacing: { before: 160 },
      }),
    ),
  ];

  if (!hasVerificationCode) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Codigo de validacao: ${input.verificationCode}`,
            size: 20,
          }),
        ],
        spacing: { before: 400 },
      }),
    );
  }

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

async function convertNativePptxToPdfBuffer(
  pptxBuffer: Buffer,
  layout: TemplateLayout,
  options: { preferCloudConvertOffice?: boolean } = {},
) {
  const mimeType = layout.baseFileType || "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  if (options.preferCloudConvertOffice) {
    const cloudConvertOfficePdf = await convertOfficeToPdfWithCloudConvertCloud({
      buffer: pptxBuffer,
      inputFormat: inferOfficeInputFormat(layout, "pptx"),
      fileName: layout.baseFileName || "certificate.pptx",
      mimeType,
      engine: "office",
    });
    if (cloudConvertOfficePdf) return Buffer.from(cloudConvertOfficePdf);
  }

  const gotenbergPdf = await convertOfficeToPdfWithGotenberg({
    buffer: pptxBuffer,
    fileName: "certificate.pptx",
    mimeType,
  });
  if (gotenbergPdf) return Buffer.from(gotenbergPdf);

  const libreOfficePdf = await convertOfficeToPdfBuffer(pptxBuffer, "pptx");
  if (libreOfficePdf) return Buffer.from(libreOfficePdf);

  const cloudConvertPdf = await convertOfficeToPdfWithCloudConvertCloud({
    buffer: pptxBuffer,
    inputFormat: inferOfficeInputFormat(layout, "pptx"),
    fileName: layout.baseFileName || "certificate.pptx",
    mimeType,
  });
  if (cloudConvertPdf) return Buffer.from(cloudConvertPdf);

  return null;
}

async function renderPptxFromBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const zip = await JSZip.loadAsync(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  const xmlFiles = await readPptxXmlFiles(zip);
  const sourceText = [
    layout.basePreviewHtml ?? "",
    ...xmlFiles.map((file) => file.content),
  ].join("\n");
  const values = expandTemplateValues(buildRenderValues(input), sourceText);

  for (const file of xmlFiles) {
    const content = fillOfficeXmlTemplate(file.content, values);
    if (content !== file.content) zip.file(file.name, content);
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function extractPptxPlainTextLines(zip: JSZip) {
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(comparePptxSlideNames);
  const lines: string[] = [];

  for (const name of slideNames) {
    const xml = await zip.file(name)?.async("text");
    const text = xml ? extractPptxTextNodes(xml) : "";
    if (text) lines.push(text);
  }

  return lines;
}

function extractPptxTextNodes(xml: string) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeOfficeXmlText(match[1] ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function applyDocxAssetReplacementsToZip(zip: PizZip, layout: TemplateLayout) {
  for (const asset of layout.baseAssets ?? []) {
    if (!asset.path || !asset.replacementDataUrl) continue;
    if (!zip.file(asset.path)) continue;
    zip.file(asset.path, dataUrlToBuffer(asset.replacementDataUrl));
  }
}

function buildRenderValues(input: RenderInput): Record<string, string> {
  return {
    ...input.values,
    ...buildVerificationTemplateValues(input.verificationCode),
  };
}

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

async function embedPdfDataUrlImage(pdfDocument: PDFDocument, dataUrl: string) {
  const buffer = dataUrlToBuffer(dataUrl);
  const mimeType = dataUrl.slice(0, dataUrl.indexOf(";")).toLowerCase();

  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return pdfDocument.embedJpg(buffer);
  }

  return pdfDocument.embedPng(buffer);
}

type EmbeddedPdfFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
};

async function embedPdfFonts(pdfDocument: PDFDocument): Promise<EmbeddedPdfFonts> {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    pdfDocument.embedFont(StandardFonts.Helvetica),
    pdfDocument.embedFont(StandardFonts.HelveticaBold),
    pdfDocument.embedFont(StandardFonts.HelveticaOblique),
    pdfDocument.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);

  return { regular, bold, italic, boldItalic };
}

function resolveElementText(element: TemplateLayout["elements"][number], values: Record<string, string>) {
  return element.type === "variable" && element.variableKey
    ? values[element.variableKey] ?? ""
    : fillTemplateText(element.content, values);
}

function drawPdfTextElement(
  page: PDFPage,
  {
    text,
    x,
    topY,
    width,
    height,
    fontSize,
    element,
    fonts,
  }: {
    text: string;
    x: number;
    topY: number;
    width: number;
    height: number;
    fontSize: number;
    element: TemplateLayout["elements"][number];
    fonts: EmbeddedPdfFonts;
  },
) {
  const font = resolvePdfFont(element, fonts);
  const lineHeight = fontSize * resolveLineHeight(element.lineHeight);
  const lines = wrapPdfText(text, font, fontSize, width);
  const contentHeight = Math.max(fontSize, lines.length * lineHeight);
  const verticalOffset = element.type === "text" ? 0 : Math.max(0, (height - contentHeight) / 2);
  let y = topY - verticalOffset - fontSize;

  for (const line of lines) {
    if (y < topY - height) break;

    const lineWidth = font.widthOfTextAtSize(line, fontSize);
    const textX =
      element.align === "right"
        ? x + Math.max(0, width - lineWidth)
        : element.align === "center"
          ? x + Math.max(0, (width - lineWidth) / 2)
          : x;

    page.drawText(line, {
      x: textX,
      y,
      size: fontSize,
      font,
      color: hexToRgb(element.color),
    });

    if (element.underline) {
      const underlineY = y - Math.max(1, fontSize * 0.08);
      page.drawLine({
        start: { x: textX, y: underlineY },
        end: { x: textX + lineWidth, y: underlineY },
        thickness: Math.max(0.5, fontSize * 0.055),
        color: hexToRgb(element.color),
      });
    }

    y -= lineHeight;
  }
}

function resolvePdfFont(element: TemplateLayout["elements"][number], fonts: EmbeddedPdfFonts) {
  if (element.bold && element.italic) return fonts.boldItalic;
  if (element.bold) return fonts.bold;
  if (element.italic) return fonts.italic;
  return fonts.regular;
}

function wrapPdfText(text: string, font: PDFFont, fontSize: number, width: number) {
  const sourceLines = text.split(/\r?\n/);
  const wrapped: string[] = [];

  for (const sourceLine of sourceLines) {
    const words = sourceLine.split(/(\s+)/).filter((part) => part.length > 0);
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current}${word}` : word.trimStart();
      if (!candidate) continue;

      if (font.widthOfTextAtSize(candidate, fontSize) <= width || !current) {
        if (font.widthOfTextAtSize(candidate, fontSize) <= width) {
          current = candidate;
          continue;
        }

        const pieces = splitLongPdfWord(candidate, font, fontSize, width);
        wrapped.push(...pieces.slice(0, -1));
        current = pieces.at(-1) ?? "";
        continue;
      }

      wrapped.push(current.trimEnd());
      current = word.trimStart();
    }

    wrapped.push(current);
  }

  return wrapped.length ? wrapped : [""];
}

function splitLongPdfWord(word: string, font: PDFFont, fontSize: number, width: number) {
  const pieces: string[] = [];
  let current = "";

  for (const char of word) {
    const candidate = `${current}${char}`;
    if (current && font.widthOfTextAtSize(candidate, fontSize) > width) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

function resolveLineHeight(value: number | undefined) {
  return Number.isFinite(value) && value ? Math.min(Math.max(value, 0.8), 2.4) : 1.15;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized, 16);
  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

function certificateHtml({
  layout,
  width,
  height,
  background,
  values,
  qrDataUrl,
  verificationCode,
}: {
  layout: TemplateLayout;
  width: number;
  height: number;
  background: string | null;
  values: Record<string, string>;
  qrDataUrl: string;
  verificationCode: string;
}) {
  const pages = buildRenderPages(layout, width, height, background);
  const showGeneratedFrame = !background && !layout.baseImageDataUrl && !layout.baseFileDataUrl && !layout.basePreviewHtml;
  const generatedFrameCss = showGeneratedFrame
    ? ".page:before{content:\"\";position:absolute;inset:24px;border:2px solid #0f766e;pointer-events:none}.page:after{content:\"\";position:absolute;inset:38px;border:1px solid #94a3b8;pointer-events:none}"
    : "";
  const pageHtml = pages.map((page) => {
    const basePreview = page.index === 0 && layout.baseFileType?.includes("wordprocessingml") && layout.basePreviewHtml && !layout.baseFileDataUrl
      ? `<div class="base-preview">${fillTemplateHtml(layout.basePreviewHtml, values)}</div>`
      : "";
    const baseImage = page.background
      ? `<img src="${escapeHtml(page.background)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;" />`
      : "";
    const baseBorder = page.border
      ? `<div style="position:absolute;inset:${page.border.inset}px;border:${page.border.width}px solid ${page.border.color};pointer-events:none;z-index:6;"></div>`
      : "";
    const elements = layout.elements
      .filter((element) => (element.pageIndex ?? 0) === page.index)
      .map((element) => {
        const common = `position:absolute;left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;color:${element.color};font-family:${element.fontFamily};font-size:${element.fontSize}px;font-weight:${element.bold ? 700 : 400};font-style:${element.italic ? "italic" : "normal"};text-decoration:${element.underline ? "underline" : "none"};text-align:${element.align};display:flex;align-items:${element.type === "text" ? "flex-start" : "center"};justify-content:${justify(element.align)};overflow:hidden;white-space:pre-wrap;word-break:break-word;line-height:${resolveLineHeight(element.lineHeight)};z-index:${resolveElementZIndex(element)};`;

        if (element.type === "image") {
          return `<img src="${escapeHtml(element.content)}" style="${common};object-fit:contain;opacity:${resolveImageOpacity(element)};" />`;
        }

        if (element.type === "qr") {
          return `<div style="${common};flex-direction:column;gap:6px;"><img src="${qrDataUrl}" style="width:${Math.min(element.width, element.height)}px;height:${Math.min(element.width, element.height)}px;" /><span style="font-size:10px;color:#334155;">${verificationCode}</span></div>`;
        }

        const text =
          element.type === "variable" && element.variableKey
            ? values[element.variableKey] ?? ""
            : fillTemplateText(element.content, values);

        return `<div style="${common}">${escapeHtml(text)}</div>`;
      })
      .join("");

    return `<main class="page" style="width:${page.width}px;height:${page.height}px;background:${page.background ? "#fff" : "#f8fafc"};">${baseImage}${basePreview}${baseBorder}${elements}</main>`;
  }).join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><style>*{box-sizing:border-box}body{margin:0;background:#fff}.page{position:relative;overflow:hidden;break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}${generatedFrameCss}.base-preview{position:absolute;inset:0;overflow:hidden;background:#fff;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.45}.base-preview p{margin:0 0 10px}.base-preview table{border-collapse:collapse;width:100%}.base-preview td,.base-preview th{border:1px solid #cbd5e1;padding:6px}.base-preview h1,.base-preview h2,.base-preview h3{margin:0 0 12px}</style></head><body>${pageHtml}</body></html>`;
}

function buildRenderPages(layout: TemplateLayout, width: number, height: number, background: string | null) {
  const isEditableBase = layout.baseDocumentMode === "editable";
  const renderImageDataUrl = layout.baseRenderFileType?.startsWith("image/")
    ? layout.baseRenderDataUrl
    : undefined;
  const hasPageImages = layout.basePages?.some((page) => Boolean(page.imageDataUrl));
  const hasMultiPageElements = layout.elements.some((element) => (element.pageIndex ?? 0) > 0);
  const sourcePages = layout.basePages?.length && (isEditableBase || hasPageImages || hasMultiPageElements)
    ? layout.basePages
    : [{ index: 0, width, height, imageDataUrl: layout.baseImageDataUrl ?? renderImageDataUrl ?? background ?? undefined, border: layout.basePageBorder }];
  const pages = sourcePages.map((page, index) => ({
    index: page.index ?? index,
    width: page.width || width,
    height: page.height || height,
    background: isEditableBase
      ? index === 0 ? background ?? undefined : undefined
      : page.imageDataUrl ?? (index === 0 ? background ?? layout.baseImageDataUrl ?? renderImageDataUrl ?? undefined : undefined),
    border: page.border ?? (index === 0 ? layout.basePageBorder : undefined),
  }));
  const maxPageIndex = Math.max(0, ...layout.elements.map((element) => element.pageIndex ?? 0));

  for (let index = pages.length; index <= maxPageIndex; index += 1) {
    pages.push({ index, width, height, background: undefined, border: undefined });
  }

  return pages.sort((a, b) => a.index - b.index);
}

function hasRenderableVisualPdfFallback(layout: TemplateLayout) {
  return Boolean(
    layout.baseImageDataUrl ||
      layout.basePages?.some((page) => Boolean(page.imageDataUrl)) ||
      (layout.baseRenderDataUrl && layout.baseRenderFileType?.startsWith("image/")),
  );
}

function justify(align: "left" | "center" | "right") {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

function isNativeDocxBaseLayout(layout: TemplateLayout) {
  return layout.baseDocumentMode !== "editable" && Boolean(layout.baseFileType?.includes("wordprocessingml") && layout.baseFileDataUrl);
}

function isNativePptxBaseLayout(layout: TemplateLayout) {
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const fileType = layout.baseFileType?.toLowerCase() ?? "";

  return layout.baseDocumentMode !== "editable" && Boolean(
    layout.baseFileDataUrl &&
      (fileType.includes("presentationml") || fileName.endsWith(".pptx")),
  );
}

function resolveImageOpacity(element: { id: string }) {
  return element.id.startsWith("watermark-") ? 0.16 : 1;
}

function resolveElementZIndex(element: { id: string; type: string; zIndex?: number }) {
  if ("zIndex" in element && typeof element.zIndex === "number") return Math.max(1, element.zIndex);
  if (element.type === "qr") return 30;
  if (element.type !== "image") return 40;
  if (element.id.startsWith("watermark-")) return 1;
  return 20;
}

function sortElementsForRender(elements: TemplateLayout["elements"]) {
  return [...elements].sort((a, b) => resolveElementZIndex(a) - resolveElementZIndex(b));
}

function parseRenderLayout(layout: unknown) {
  return normalizeVisualDocxLayout(templateLayoutSchema.parse(layout));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fillTemplateHtml(html: string, values: Record<string, string>) {
  return html.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawKey) => {
    const originalKey = String(rawKey).trim();
    const normalizedKey = normalizeVariableKey(originalKey);
    return escapeHtml(values[normalizedKey] ?? values[originalKey] ?? "");
  });
}

async function readPptxXmlFiles(zip: JSZip) {
  const files: Array<{ name: string; content: string }> = [];

  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/.+\.xml$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    files.push({ name, content: await file.async("text") });
  }

  return files;
}

function fillOfficeXmlTemplate(xml: string, values: Record<string, string>) {
  return xml
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawKey) =>
      escapeXml(resolveTemplateValue(rawKey, values)),
    )
    .replace(/(^|[^{])\{\s*([A-Za-z0-9_\u00c0-\u017f ]+?)\s*\}([^}]|$)/g, (_, prefix, rawKey, suffix) =>
      `${prefix}${escapeXml(resolveTemplateValue(rawKey, values))}${suffix}`,
    );
}

function expandTemplateValues(values: Record<string, string>, sourceText: string) {
  const expanded = { ...values };

  for (const match of sourceText.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const originalKey = String(match[1]).trim();
    const normalizedKey = normalizeVariableKey(originalKey);
    if (expanded[originalKey] === undefined && values[normalizedKey] !== undefined) {
      expanded[originalKey] = values[normalizedKey];
    }
  }

  for (const match of sourceText.matchAll(/(^|[^{])\{\s*([A-Za-z0-9_\u00c0-\u017f ]+?)\s*\}([^}]|$)/g)) {
    const originalKey = String(match[2]).trim();
    const normalizedKey = normalizeVariableKey(originalKey);
    if (expanded[originalKey] === undefined && values[normalizedKey] !== undefined) {
      expanded[originalKey] = values[normalizedKey];
    }
  }

  return expanded;
}

function resolveTemplateValue(rawKey: string, values: Record<string, string>) {
  const originalKey = String(rawKey).trim();
  const normalizedKey = normalizeVariableKey(originalKey);
  return values[originalKey] ?? values[normalizedKey] ?? "";
}

function inferOfficeInputFormat(layout: TemplateLayout, fallback: "docx" | "pptx") {
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const fileType = layout.baseFileType?.toLowerCase() ?? "";

  if (fileName.endsWith(".pptx") || fileType.includes("presentationml")) return "pptx";
  if (fileName.endsWith(".docx") || fileType.includes("wordprocessingml")) return "docx";
  return fallback;
}

function comparePptxSlideNames(left: string, right: string) {
  return pptxSlideNumber(left) - pptxSlideNumber(right);
}

function pptxSlideNumber(value: string) {
  return Number(value.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
}

function decodeOfficeXmlText(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
