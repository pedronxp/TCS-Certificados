import { Document, Packer, Paragraph, TextRun } from "docx";
import Docxtemplater from "docxtemplater";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import PizZip from "pizzip";
import QRCode from "qrcode";
import { fillTemplateText, normalizeVariableKey, normalizeVisualDocxLayout, templateLayoutSchema, type TemplateLayout } from "@/lib/certificate-layout";
import {
  BRIGADA_ORGANICA_PDF_VERSION_MARKER,
  certificateFileExtension,
  certificateFileMimeType,
  getTemplateNativeFileType,
  type NativeCertificateFileType,
} from "@/lib/certificate-output-format";
import { convertOfficeToPdfWithCloudConvert } from "@/lib/cloudconvert";
import { convertDocxToPdfWithGotenberg, convertOfficeToPdfWithGotenberg } from "@/lib/gotenberg";
import { convertOfficeToPdfWithILoveApi } from "@/lib/iloveapi";
import { convertDocxToPdfBuffer, convertOfficeToPdfBuffer } from "@/lib/libreoffice";
import { convertDocxToPdfWithMicrosoftGraph } from "@/lib/microsoft-graph";
import { buildVerificationTemplateValues } from "@/lib/verification-code";

export const DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE =
  "Conversor Office para PDF indisponivel. Configure GOTENBERG_URL ou LIBREOFFICE_PATH em ambiente local.";

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
    const nativePdf = await renderPdfFromNativeDocxBaseTemplate(input, layout);
    if (nativePdf) return nativePdf;
    throw new Error(DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE);
  }
  if (isNativePptxBaseLayout(layout)) {
    const nativePdf = await renderPdfFromNativePptxBaseTemplate(input, layout);
    if (nativePdf) return nativePdf;
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
    console.warn("Playwright indisponÃ­vel; usando fallback pdf-lib.", error);
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
        ? resolveTemplateValue(element.variableKey, values)
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
  const docxBuffer = postprocessNativeDocxForPdf(input, layout, renderDocxFromBaseTemplate(input, layout));
  const expectedPageCount = getExpectedNativeDocxPdfPageCount(input, layout);

  const controlledPdf = await renderKnownNativeDocxPdf(input, layout);
  if (controlledPdf) return controlledPdf;

  const nativePdf = await convertDocxToPdfWithFallbacks(docxBuffer);

  if (nativePdf) {
    const nativeInfo = await getPdfInfo(nativePdf);
    if (!nativeInfo) return nativePdf;

    if (
      nativeInfo.pageCount === expectedPageCount &&
      pdfFirstPageMatchesTemplateSize(nativeInfo, input.template.width, input.template.height, layout)
    ) {
      return markBrigadaOrganicaPdfIfNeeded(input, layout, nativePdf);
    }

    if (
      nativeInfo.pageCount > expectedPageCount &&
      pdfFirstPageMatchesTemplateSize(nativeInfo, input.template.width, input.template.height, layout) &&
      await hasOnlyValidationOverflowPages(nativePdf, expectedPageCount, input.verificationCode)
    ) {
      const trimmedPdf = await trimNativePdfValidationOverflow(nativePdf, expectedPageCount, input.verificationCode);
      return markBrigadaOrganicaPdfIfNeeded(input, layout, trimmedPdf);
    }

    if (
      isNr35Layout(input, layout) &&
      nativeInfo.pageCount > expectedPageCount &&
      pdfFirstPageMatchesTemplateSize(nativeInfo, input.template.width, input.template.height, layout)
    ) {
      const trimmedPdf = await trimNativePdfToPageCount(nativePdf, expectedPageCount);
      return markBrigadaOrganicaPdfIfNeeded(input, layout, trimmedPdf);
    }
  }

  return null;
}

async function renderKnownNativeDocxPdf(input: RenderInput, layout: TemplateLayout) {
  if (isSuporteBasicoVidaV2Layout(input, layout)) {
    return renderSuporteBasicoVidaPdf(input, layout);
  }

  return null;
}

function isSuporteBasicoVidaV2Layout(input: RenderInput, layout: TemplateLayout) {
  const marker = `${input.template.name} ${layout.baseFileName ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const hasImportedRedBorder = layout.basePages?.some((page) =>
    page.border?.color?.toLowerCase() === "#ff0000" && page.border.width >= 4
  );

  return Boolean(hasImportedRedBorder) && marker.includes("suporte basico de vida") && marker.includes("v2");
}

function postprocessNativeDocxForPdf(input: RenderInput, layout: TemplateLayout, docxBuffer: Buffer) {
  if (isBrigadaOrganicaLayout(input, layout)) {
    return compactBrigadaOrganicaContentTable(docxBuffer);
  }

  if (isAtendimentoPreHospitalarLayout(input, layout)) {
    return compactAtendimentoPreHospitalarContent(docxBuffer);
  }

  if (isInstrutorPrimeirosSocorrosLayout(input, layout)) {
    return compactInstrutorPrimeirosSocorrosContent(docxBuffer);
  }

  if (isNr12MotosserraRocadeiraLayout(input, layout)) {
    return compactNr12MotosserraRocadeiraContent(docxBuffer);
  }

  if (isGuindautoLayout(input, layout)) {
    return compactGuindautoContent(docxBuffer);
  }

  if (isNr06Layout(input, layout)) {
    return compactNr06Content(docxBuffer);
  }

  if (isNr31Layout(input, layout)) {
    return compactNr31Content(docxBuffer);
  }

  if (isNr18Layout(input, layout)) {
    return normalizeNr18Content(docxBuffer);
  }

  if (isNr20Layout(input, layout)) {
    return normalizeNr20Content(docxBuffer);
  }

  if (isRetroescavadeiraLayout(input, layout)) {
    return normalizeRetroescavadeiraContent(docxBuffer);
  }

  if (isNr35Layout(input, layout)) {
    return normalizeNr35Content(docxBuffer);
  }

  if (isCombateIncendiosFlorestaisLayout(input, layout)) {
    return normalizeCombateIncendiosFlorestaisContent(docxBuffer);
  }

  if (isCursoSbvLayout(input, layout)) {
    return normalizeCursoSbvContent(docxBuffer);
  }

  if (isCursoInjetavelLayout(input, layout)) {
    return normalizeCursoInjetavelContent(docxBuffer);
  }

  return docxBuffer;
}

function isBrigadaOrganicaLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("curso de formacao de brigada organica");
}

function isAtendimentoPreHospitalarLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("atendimento pre-hospitalar");
}

function isInstrutorPrimeirosSocorrosLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("instrutor") && marker.includes("primeiros socorros");
}

function isNr12MotosserraRocadeiraLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("nr 12") && marker.includes("motosserra");
}

function isGuindautoLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("guindauto");
}

function isNr06Layout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("nr 06") || marker.includes("certificado nr 06");
}

function isNr31Layout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("nr31") || marker.includes("nr 31");
}

function isNr18Layout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("nr18") || marker.includes("nr 18");
}

function isNr20Layout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("nr20") || marker.includes("nr 20");
}

function isRetroescavadeiraLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("retroescavadeira");
}

function isNr35Layout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("nr35") || marker.includes("nr 35");
}

function isCombateIncendiosFlorestaisLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("combate") && marker.includes("incendio") && marker.includes("florestais");
}

function isCursoSbvLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("curso de sbv");
}

function isCursoInjetavelLayout(input: RenderInput, layout: TemplateLayout) {
  const marker = normalizeModelMarker(`${input.template.name} ${layout.baseFileName ?? ""}`);
  return marker.includes("injetavel");
}

function normalizeModelMarker(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactBrigadaOrganicaContentTable(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let compactedXml = compactBrigadaOrganicaTableFonts(documentXml);
    compactedXml = normalizeBrigadaOrganicaHeader(zip, compactedXml);
    compactedXml = compactBrigadaOrganicaSignatureParagraph(compactedXml);
    compactedXml = addBrigadaOrganicaContentPageBreak(compactedXml);
    compactedXml = clipBrigadaOrganicaBadgeImage(zip, compactedXml);

    if (compactedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", compactedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function compactBrigadaOrganicaFontSize(fontSize: number) {
  if (fontSize >= 24) return 20;
  if (fontSize >= 18) return 16;
  return fontSize;
}

function compactAtendimentoPreHospitalarContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const compactedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);
      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 54, 54, 240, { after: 240 });
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 22, 22, 240, { before: 760 });
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 30, 30, 220);
    });

    if (compactedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", compactedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function compactAtendimentoPreHospitalarParagraph(
  paragraphXml: string,
  maxFontSize: number,
  maxComplexFontSize: number,
  lineHeight: number,
  spacing: { before?: number; after?: number } = {},
) {
  const compactedParagraph = paragraphXml
    .replace(/<w:spacing\b[^>]*\/>/g, "")
    .replace(/<w:sz(?!Cs)([^>]*)w:val="(\d+)"([^>]*)\/>/g, (_match, before, value, after) => {
      const nextValue = Math.min(Number(value), maxFontSize);
      return `<w:sz${before}w:val="${nextValue}"${after}/>`;
    })
    .replace(/<w:szCs([^>]*)w:val="(\d+)"([^>]*)\/>/g, (_match, before, value, after) => {
      const nextValue = Math.min(Number(value), maxComplexFontSize);
      return `<w:szCs${before}w:val="${nextValue}"${after}/>`;
    });

  return ensureDocxParagraphProperty(
    compactedParagraph,
    `<w:spacing w:before="${spacing.before ?? 0}" w:after="${spacing.after ?? 0}" w:line="${lineHeight}" w:lineRule="auto"/>`,
  );
}

function forceDocxParagraphFont(paragraphXml: string, fontName = "Arial") {
  const fontXml = `<w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:eastAsia="${fontName}" w:cs="${fontName}"/>`;
  return paragraphXml
    .replace(/<w:rFonts\b[^>]*\/>/g, "")
    .replace(/<w:color\b[^>]*\/>/g, "")
    .replace(/<w:rPr>/g, `<w:rPr>${fontXml}<w:color w:val="000000"/>`);
}

function centerDocxParagraph(paragraphXml: string) {
  const withoutExistingAlignment = paragraphXml.replace(/<w:jc\b[^>]*\/>/g, "");
  return ensureDocxParagraphProperty(withoutExistingAlignment, '<w:jc w:val="center"/>');
}

function compactInstrutorPrimeirosSocorrosContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const compactedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText === "certificado") {
        return normalizeInstrutorCertificateHeader(paragraphXml);
      }

      if (normalizedText.includes("confere o presente certificado")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 28, 28, 205);
      }

      if (normalizedText.includes("decreto 5.154") || normalizedText.includes("cataguases,")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 28, 28, 205);
      }

      if (normalizedText.includes("carlos alexandre") && normalizedText.includes("cbmmg")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 27, 27, 175);
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 54, 54, 240, { after: 320 });
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("tico cursos")) {
        inProgramContent = false;
        return centerDocxParagraph(compactAtendimentoPreHospitalarParagraph(paragraphXml, 24, 24, 230, { before: 460 }));
      }

      if (normalizedText.includes("curso de instrutor") || normalizedText.includes("carga horaria")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 36, 36, 230, { after: 120 });
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 31, 31, 238);
    });

    if (compactedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", compactedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeInstrutorCertificateHeader(paragraphXml: string) {
  return paragraphXml.replace(
    /<w:t xml:space="preserve">\s+<\/w:t>(?=<\/w:r><w:r\b[\s\S]*?<w:t>CERTIFICADO<\/w:t>)/,
    '<w:t xml:space="preserve">        </w:t>',
  );
}

function compactNr12MotosserraRocadeiraContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    const cleanedDocumentXml = documentXml
      .replace(/Maquinas/g, "Máquinas")
      .replace(/Emprego-\s*MTE/g, "Emprego - MTE")
      .replace(/ministério do Trabalho/g, "Ministério do Trabalho")
      .replace(/Reg\.MTE\s*0056818\/MG/g, "Reg.MTE 0056818/MG")
      .replace(/,\s*Numeração:/g, " Numeração: ")
      .replace(/Numeração:\s*/g, "Numeração: ");

    let inProgramContent = false;
    const compactedXml = cleanedDocumentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("nr 12") && normalizedText.includes("seguranca no trabalho")) {
        return replaceDocxParagraphText(paragraphXml, text.replace(/Maquinas/i, "Máquinas"));
      }

      if (normalizedText.includes("conforme determina a portaria")) {
        return compactAtendimentoPreHospitalarParagraph(
          replaceDocxParagraphText(paragraphXml, normalizeNr12PortariaText(text)),
          30,
          30,
          300,
          { after: 180 },
        );
      }

      if (normalizedText.includes("carlos alexandre") && normalizedText.includes("aluno")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 30, 30, 220, { before: 980 });
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(
          compactAtendimentoPreHospitalarParagraph(paragraphXml, 46, 46, 230, { after: 180 }),
          "<w:pageBreakBefore/>",
        );
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        return centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(
            replaceDocxParagraphText(paragraphXml, normalizeNr12FooterText(text)),
            22,
            22,
            220,
            { before: 2850 },
          ),
        );
      }

      if (normalizedText.includes("treinamento de seguranca")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 32, 32, 220, { after: 430 });
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 24, 24, 215);
    });

    const normalizedXml = normalizeNr12ProgramTable(compactedXml);

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeNr12PortariaText(text: string) {
  return text
    .replace(/\s+\/\s*/g, "/")
    .replace(/\.(Conforme determina)/i, ". $1")
    .replace(/ministério do Trabalho/i, "Ministério do Trabalho")
    .replace(/Emprego-\s*MTE/i, "Emprego - MTE")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeNr12FooterText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/,\s*Numeração:/i, " Numeração: ")
    .replace(/Numeração:\s*/i, "Numeração: ")
    .trim();
}

const NR12_PROGRAM_COLUMNS = [
  [
    "Princípios e Objetivos;",
    "Termos e Definições;",
    "Requisitos da Norma;",
    "Arranjos físicos e instalações;",
    "Instalações e dispositivos elétricos;",
    "Dispositivo de Partida;",
    "acionamento e parada;",
    "Sistema de Segurança;",
    "Dispositivo de parada de Emergência;",
    "Meios de acesso permanente;",
  ],
  [
    "Componentes pressurizados;",
    "transporte de materiais;",
    "aspecto ergonômico;",
    "Riscos adicionais;",
    "manutenção, inspeção, preparação, ajustes e reparos;",
    "procedimento de trabalho e segurança;",
    "Capacitação;",
    "Planejamento e Implementação dos Cursos,",
    "Outros requisitos específicos de segurança;",
    "Definições finais;",
  ],
] as const;

function normalizeNr12ProgramTable(documentXml: string) {
  return documentXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    const normalizedTableText = normalizeModelMarker(extractDocxParagraphText(tableXml));
    if (
      !normalizedTableText.includes("principios e objetivos") ||
      !normalizedTableText.includes("componentes pressurizados")
    ) {
      return tableXml;
    }

    let cellIndex = 0;
    return tableXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
      const lines = NR12_PROGRAM_COLUMNS[cellIndex];
      cellIndex += 1;
      return lines ? buildNr12ProgramCell(cellXml, lines) : cellXml;
    });
  });
}

function buildNr12ProgramCell(cellXml: string, lines: readonly string[]) {
  const cellProperties = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>|<w:tcPr\b[^>]*\/>/)?.[0] ?? "";
  const paragraphs = lines.map((line) => buildNr12ProgramLineParagraph(line)).join("");
  return `<w:tc>${cellProperties}${paragraphs}</w:tc>`;
}

function buildNr12ProgramLineParagraph(text: string) {
  return [
    '<w:p>',
    '<w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="305" w:lineRule="auto"/>',
    '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:noProof/><w:sz w:val="30"/><w:szCs w:val="30"/><w:lang w:eastAsia="pt-BR"/></w:rPr></w:pPr>',
    '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:noProof/><w:sz w:val="30"/><w:szCs w:val="30"/><w:lang w:eastAsia="pt-BR"/></w:rPr>',
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`,
    "</w:p>",
  ].join("");
}

function compactGuindautoContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const compactedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("certifica que o sr")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 30, 30, 210);
      }

      if (normalizedText.includes("cataguases,")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 30, 30, 190);
      }

      if (normalizedText.includes("carlos alexandre") || normalizedText.includes("coren mg")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 32, 32, 170);
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(
          compactAtendimentoPreHospitalarParagraph(paragraphXml, 46, 46, 220, { before: 650, after: 1200 }),
          "<w:pageBreakBefore/>",
        );
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        return centerDocxParagraph(compactAtendimentoPreHospitalarParagraph(paragraphXml, 22, 22, 220, { before: 1500 }));
      }

      if (
        normalizedText.includes("instrutor:") ||
        normalizedText.includes("frequencia") ||
        normalizedText.includes("media aprovacao")
      ) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 27, 27, 190);
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 27, 27, 190);
    });

    if (compactedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", compactedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function compactNr06Content(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const compactedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("curso de formacao de brigada organica")) {
        return buildSimpleCenteredDocxParagraph("CURSO DE EQUIPAMENTOS DE PROTE\u00c7\u00c3O INDIVIDUAL (EPI)", 42, 220);
      }

      if (normalizedText.includes("confere que")) {
        return compactAtendimentoPreHospitalarParagraph(normalizeNr06BodyParagraph(paragraphXml), 30, 30, 215);
      }

      if (normalizedText.includes("cataguases,")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 30, 30, 185);
      }

      if (normalizedText.includes("carlos alexandre") && normalizedText.includes("coren mg")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 28, 28, 185);
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(
          compactAtendimentoPreHospitalarParagraph(paragraphXml, 44, 44, 230, { after: 160 }),
          "<w:pageBreakBefore/>",
        );
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        return centerDocxParagraph(compactAtendimentoPreHospitalarParagraph(paragraphXml, 22, 22, 220, { before: 2200 }));
      }

      if (normalizedText.includes("curso de equipamentos") || normalizedText.includes("carga horaria")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 32, 32, 260);
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 30, 30, 310);
    });

    if (compactedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", compactedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeNr06BodyParagraph(paragraphXml: string) {
  return paragraphXml
    .replace(/(<w:t(?: [^>]*)?>Sr\(a\))(?!\s)(<\/w:t>)/g, "$1 $2")
    .replace(/realizadono/g, "realizado no")
    .replace(
      /(<w:t(?: [^>]*)?>\s*realizado)\s*(<\/w:t><\/w:r><w:r\b[\s\S]*?<w:t(?: [^>]*)?>)no dia/g,
      "$1 $2no dia",
    );
}

function compactNr31Content(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    let leadingProgramDuplicateCount = 0;
    const compactedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 44, 44, 220, { after: 260 });
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        const footerText = text.replace(/\s+/g, " ").trim();
        return centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(replaceDocxParagraphText(paragraphXml, footerText), 18, 18, 190, { before: 420 }),
        );
      }

      if (normalizedText.includes("curso de formacao de brigada") || normalizedText.includes("carga horaria")) {
        return compactAtendimentoPreHospitalarParagraph(
          replaceDocxParagraphText(paragraphXml, "Curso de NR31 Carga horária 8hrs"),
          32,
          32,
          220,
          { after: 180 },
        );
      }

      if (
        normalizedText === "riscos fisicos, quimicos e biologicos" ||
        normalizedText === "ergonomia" ||
        normalizedText.includes("equipamentos de protecao individual (epi)riscos fisicos")
      ) {
        leadingProgramDuplicateCount += 1;
        if (leadingProgramDuplicateCount <= 2) return "";
        return compactAtendimentoPreHospitalarParagraph(
          replaceDocxParagraphText(paragraphXml, "Riscos físicos, químicos e biológicos"),
          24,
          24,
          185,
        );
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 24, 24, 185);
    });

    if (compactedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", compactedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function replaceDocxParagraphText(paragraphXml: string, text: string) {
  let replaced = false;
  return paragraphXml.replace(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>/g, (textXml) => {
    if (replaced) return textXml.replace(/(<w:t(?: [^>]*)?>)[\s\S]*?(<\/w:t>)/, "$1$2");
    replaced = true;
    return textXml.replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/, (_match, attrs: string) => {
      const nextAttrs = /^\s|\s$/.test(text) && !attrs.includes("xml:space=")
        ? `${attrs} xml:space="preserve"`
        : attrs;
      return `<w:t${nextAttrs}>${escapeXml(text)}</w:t>`;
    });
  });
}

function replaceDocxParagraphTextWithLineBreaks(paragraphXml: string, lines: readonly string[]) {
  let replaced = false;
  return paragraphXml.replace(/<w:t(?: [^>]*)?>[\s\S]*?<\/w:t>/g, (textXml) => {
    if (replaced) return textXml.replace(/(<w:t(?: [^>]*)?>)[\s\S]*?(<\/w:t>)/, "$1$2");
    replaced = true;
    return textXml.replace(/<w:t([^>]*)>[\s\S]*?<\/w:t>/, (_match, attrs: string) => {
      return lines.map((line) => `<w:t${attrs}>${escapeXml(line)}</w:t>`).join("<w:br/>");
    });
  });
}

function normalizeNr18Content(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    const normalizedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("conteudo programatico")) {
        return ensureDocxParagraphProperty(paragraphXml, "<w:pageBreakBefore/>");
      }

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        return centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(paragraphXml, 24, 24, 220, { before: 650 }),
        );
      }

      return paragraphXml;
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeNr20Content(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    const cleanedDocumentXml = documentXml
      .replace(/Reg\.MTE\s*0056818\/MG/g, "Reg.MTE 0056818/MG")
      .replace(/carga horaria/g, "carga horária")
      .replace(/combustível\)/gi, "Combustível)");

    let inProgramContent = false;
    let insertedProgramHeader = false;
    const normalizedXml = cleanedDocumentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("carlos alexandre") && normalizedText.includes("aluno")) {
        return compactAtendimentoPreHospitalarParagraph(
          removeNr20AlunoNameFromSignature(paragraphXml, text),
          32,
          32,
          220,
          { before: 260 },
        );
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return "";
      }

      if (inProgramContent && normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        return centerDocxParagraph(
          forceDocxParagraphFont(
            compactAtendimentoPreHospitalarParagraph(paragraphXml, 24, 24, 240, { before: 2200 }),
            "Times New Roman",
          ),
        );
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("carga horaria") || normalizedText.includes("conteudo programatico teorico")) {
        const compactParagraph = forceDocxParagraphFont(
          compactAtendimentoPreHospitalarParagraph(paragraphXml, 34, 34, 310, { after: 160 }),
          "Times New Roman",
        );
        if (insertedProgramHeader) return compactParagraph;

        insertedProgramHeader = true;
        return `${ensureDocxParagraphProperty(
          buildSimpleCenteredDocxParagraph("CONTEÚDO PROGRAMÁTICO", 46, 270, "Times New Roman", true),
          "<w:pageBreakBefore/>",
        )}${compactParagraph}`;
      }

      return forceDocxParagraphFont(
        compactAtendimentoPreHospitalarParagraph(paragraphXml, 33, 33, 310, { after: 100 }),
        "Times New Roman",
      );
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function removeNr20AlunoNameFromSignature(paragraphXml: string, text: string) {
  const studentName = text.match(/Faria\s+(.+?)\s+Reg\.MTE/i)?.[1]?.trim();
  if (!studentName) return paragraphXml;

  return paragraphXml.replace(
    new RegExp(`(<w:t(?: [^>]*)?>)${escapeRegExp(studentName)}(<\\/w:t>)`, "g"),
    "$1$2",
  ).replace(
    new RegExp(`(<w:t(?: [^>]*)?>)(\\s*)${escapeRegExp(studentName)}(\\s*)(<\\/w:t>)`, "g"),
    "$1$2$3$4",
  );
}

function normalizeRetroescavadeiraContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const normalizedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(paragraphXml, "<w:pageBreakBefore/>");
      }

      if (inProgramContent && normalizedText === ".") {
        return "";
      }

      if (inProgramContent && normalizedText.includes("seguraca e ambiente")) {
        return replaceDocxParagraphText(paragraphXml, text.replace(/Seguraça/i, "Segurança"));
      }

      return paragraphXml;
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeCombateIncendiosFlorestaisContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const normalizedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);
      const withoutLoosePunctuation = removeIsolatedDocxTextNodes(paragraphXml, [".", ";"]);

      if (normalizedText.includes("curso de prevencao") && normalizedText.includes("florestais")) {
        return compactAtendimentoPreHospitalarParagraph(
          replaceDocxParagraphText(
            withoutLoosePunctuation,
            "CURSO DE PREVENÇÃO E COMBATE A INCÊNDIOS FLORESTAIS E PRIMEIROS SOCORROS",
          ),
          54,
          54,
          380,
          { after: 240 },
        );
      }

      if (
        normalizedText.includes("certifica que o sr") &&
        normalizedText.includes("preven") &&
        normalizedText.includes("incendio florestal")
      ) {
        return compactAtendimentoPreHospitalarParagraph(
          replaceDocxParagraphText(withoutLoosePunctuation, normalizeCombateIncendiosCertificateText(text)),
          30,
          30,
          275,
        );
      }

      if (normalizedText.includes("cataguases,")) {
        return replaceDocxParagraphText(withoutLoosePunctuation, normalizeCombateIncendiosLoosePunctuation(text));
      }

      if (normalizedText === "." || normalizedText === ";") {
        return "";
      }

      if (!inProgramContent && withoutLoosePunctuation !== paragraphXml) {
        return withoutLoosePunctuation;
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(
          compactAtendimentoPreHospitalarParagraph(withoutLoosePunctuation, 54, 54, 300, { after: 360 }),
          "<w:pageBreakBefore/>",
        );
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        const footerText = text.replace(/\s+/g, " ").trim();
        return centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(
            replaceDocxParagraphText(paragraphXml, footerText),
            24,
            24,
            230,
            { before: 260 },
          ),
        );
      }

      if (normalizedText === "primeiros socorros" || normalizedText === "incendio em mata") {
        return compactAtendimentoPreHospitalarParagraph(withoutLoosePunctuation, 36, 36, 260);
      }

      return compactAtendimentoPreHospitalarParagraph(withoutLoosePunctuation, 30, 30, 260);
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeCombateIncendiosCertificateText(text: string) {
  return normalizeCombateIncendiosLoosePunctuation(text)
    .replace(/Sr\(a\)\.?\s*/i, "Sr(a). ")
    .replace(/\s*,\s*portador/i, ", portador")
    .replace(/Prevenção\s*e?/i, "Prevenção e")
    .replace(/Prevençãoe/i, "Prevenção e")
    .replace(/Combate\s*a\s*Incêndio/i, "Combate a Incêndio")
    .replace(/enfase/i, "ênfase")
    .replace(/Socorros,\s*realizado/i, "Socorros, realizado")
    .replace(/no\s+(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i, "no dia $1")
    .replace(/\s+,\s*/g, ", ")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function removeIsolatedDocxTextNodes(paragraphXml: string, values: string[]) {
  return paragraphXml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (textXml, attrs: string, value: string) => {
    return values.includes(value.trim()) ? `<w:t${attrs}></w:t>` : textXml;
  });
}

function normalizeCursoSbvContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    const cleanedDocumentXml = documentXml
      .replace(/Avaliação inicial,Avaliação/g, "Avaliação inicial, Avaliação")
      .replace(/RCP\s*,/g, "RCP,")
      .replace(/9\.\s*PCR/g, "8. PCR")
      .replace(/10\.\s*Oficinas/g, "9. Oficinas")
      .replace(/(<w:t[^>]*>\s*)9(<\/w:t>\s*<\/w:r>\s*<w:r\b[\s\S]*?<w:t[^>]*>\.\s*PCR)/, "$18$2")
      .replace(
        /(A\.V\.E;[\s\S]*?)1(<\/w:t>\s*<\/w:r>\s*<w:r\b[\s\S]*?<w:t[^>]*>)0(<\/w:t>\s*<\/w:r>\s*<w:r\b[\s\S]*?<w:t[^>]*>\. Oficinas)/,
        "$19$2$3",
      )
      .replace(/,\s*Numeração/g, " Numeração");

    let inProgramContent = false;
    const normalizedXml = cleanedDocumentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("confere o presente certificado")) {
        return compactAtendimentoPreHospitalarParagraph(
          replaceDocxParagraphText(paragraphXml, normalizeCursoSbvBodyText(text)),
          32,
          32,
          240,
        );
      }

      if (
        normalizedText.includes("cataguases") &&
        normalizedText.includes("2026") &&
        !normalizedText.includes("t.c.s") &&
        !normalizedText.includes("cursos e servicos")
      ) {
        return replaceDocxParagraphText(paragraphXml, normalizeCursoSbvDateText(text));
      }

      if (normalizedText.includes("conteudo programatico")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(
          compactAtendimentoPreHospitalarParagraph(paragraphXml, 50, 50, 260, { after: 240 }),
          "<w:pageBreakBefore/>",
        );
      }

      if (inProgramContent && normalizedText === ".") {
        return "";
      }

      if (inProgramContent && normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        const footerParagraph = centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(
            replaceDocxParagraphText(paragraphXml, normalizeCursoSbvFooterText(text)),
            24,
            24,
            230,
            { before: 0 },
          ),
        );
        return `${buildDocxSpacerParagraph(1120)}${footerParagraph}`;
      }

      if (!inProgramContent) return paragraphXml;

      if (normalizedText.includes("curso de bls") || normalizedText.includes("carga horaria")) {
        return compactAtendimentoPreHospitalarParagraph(paragraphXml, 36, 36, 240, { after: 80 });
      }

      return compactAtendimentoPreHospitalarParagraph(paragraphXml, 32, 32, 240);
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function normalizeCursoSbvBodyText(text: string) {
  return text
    .replace(/\s+,\s*/g, ", ")
    .replace(/Sr\(a\)\.\s*/i, "Sr(a). ")
    .replace(/Lei\s*9\.394\/96/i, "Lei 9.394/96")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeCursoSbvDateText(text: string) {
  return text
    .replace(/\s+,\s*/g, ", ")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeCursoSbvFooterText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*Numeração/i, " Numeração")
    .trim();
}

function normalizeCursoInjetavelContent(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(normalizeCursoSbvContent(docxBuffer));
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    const normalizedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (normalizedText.includes("carlos alexandre") && normalizedText.includes("aluno")) {
        return compactAtendimentoPreHospitalarParagraph(
          removeCursoInjetavelAlunoNameFromSignature(paragraphXml, text),
          32,
          32,
          220,
          { before: 480 },
        );
      }

      if (normalizedText.includes("certificado valido apenas com a assinatura do aluno")) {
        return centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(
            replaceDocxParagraphTextWithLineBreaks(paragraphXml, [
              "Certificado válido apenas com",
              "a assinatura do aluno",
            ]),
            32,
            32,
            220,
            { before: 80 },
          ),
        );
      }

      if (normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        return `${buildDocxSpacerParagraph(820)}${paragraphXml}`;
      }

      return paragraphXml;
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function removeCursoInjetavelAlunoNameFromSignature(paragraphXml: string, text: string) {
  const studentName = text.match(/Faria\s+(.+?)\s+Coren MG/i)?.[1]?.trim();
  if (!studentName) return paragraphXml;

  const escapedName = escapeRegExp(studentName);
  return paragraphXml.replace(
    new RegExp(`(<w:t(?: [^>]*)?>)${escapedName}(<\\/w:t>)`, "g"),
    "$1$2",
  );
}

function buildDocxSpacerParagraph(lineHeight: number) {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${lineHeight}" w:lineRule="auto"/><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">&#160;</w:t></w:r></w:p>`;
}

function normalizeCombateIncendiosLoosePunctuation(text: string) {
  return text
    .replace(/,\s*(?=\S)/g, ", ")
    .replace(/\s+,\s*/g, ", ")
    .replace(/\s+\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeNr35Content(docxBuffer: Buffer) {
  try {
    const zip = new PizZip(docxBuffer);
    const documentXmlFile = zip.file("word/document.xml");
    const documentXml = documentXmlFile?.asText();
    if (!documentXml) return docxBuffer;

    let inProgramContent = false;
    const normalizedXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
      const text = extractDocxParagraphText(paragraphXml);
      const normalizedText = normalizeModelMarker(text);

      if (!normalizedText && inProgramContent) {
        return "";
      }

      if (
        normalizedText.includes("submetido") &&
        normalizedText.includes("aprovado") &&
        normalizedText.includes("trabalho em altura")
      ) {
        return replaceDocxParagraphText(
          paragraphXml,
          text
            .replace(/portador do CPF/i, "portador(a) do CPF")
            .replace(/CPF\s+([^,]+?)\s+por ter/i, "CPF $1, por ter")
            .replace(/por ter submetido e aprovado em treinamento,?\s+te\S*rico e pr\S*tico para Trabalho em Altura pela Empresa/i, "por ter participado e sido aprovado(a) no treinamento teórico e prático de Trabalho em Altura pela empresa")
            .replace(/por ter submetido e aprovado em treinamento,?\s+te\S*rico e pr\S*tico para Trabalho em Altura/i, "por ter participado e sido aprovado(a) no treinamento teórico e prático de Trabalho em Altura"),
        );
      }

      if (normalizedText.includes("emprego") && normalizedText.includes("mte")) {
        return replaceDocxParagraphText(
          paragraphXml,
          text
            .replace(/o minist\S*rio/i, "o Ministério")
            .replace(/Emprego-\s*MTE/i, "Emprego - MTE")
            .replace(/\s+\/\s*/g, "/"),
        );
      }

      if (normalizedText.includes("cataguases,")) {
        return paragraphXml;
      }

      if (normalizedText.includes("carlos alexandre") && normalizedText.includes("coren mg")) {
        return paragraphXml;
      }

      if (normalizedText.includes("conteudo programatico") || normalizedText.includes("program")) {
        inProgramContent = true;
        return ensureDocxParagraphProperty(paragraphXml, "<w:pageBreakBefore/>");
      }

      if (normalizedText.includes("curso de trabalho em altura") && normalizedText.includes("nr-35")) {
        return replaceDocxParagraphText(
            paragraphXml,
            text
              .replace(/Trabalho em altura/i, "Trabalho em Altura")
              .replace(/NR-35\s+\S*ria/i, "NR-35 Carga horária"),
        );
      }

      if (
        normalizedText.includes("normas e regulamentos") ||
        normalizedText.includes("analise de risco") ||
        normalizedText.includes("riscos potenciais") ||
        normalizedText.includes("equipamentos de protecao individual") ||
        normalizedText.includes("acidentes tipicos") ||
        normalizedText.includes("acidentes") ||
        normalizedText.includes("condutas em situacoes")
      ) {
        return compactAtendimentoPreHospitalarParagraph(
          removeDocxParagraphNumbering(
            removeDocxParagraphKeepRules(
              replaceDocxParagraphText(paragraphXml, normalizeNr35ProgramItemText(text)),
            ),
          ),
          31,
          31,
          340,
          { after: 35 },
        );
      }

      if (inProgramContent && normalizedText.includes("t.c.s") && normalizedText.includes("cursos e servicos")) {
        inProgramContent = false;
        const footerText = text.replace(/\s+/g, " ").trim();
        return centerDocxParagraph(
          compactAtendimentoPreHospitalarParagraph(
            replaceDocxParagraphText(paragraphXml, footerText),
            21,
            21,
            210,
            { before: 4850 },
          ),
        );
      }

      return paragraphXml;
    });

    if (normalizedXml === documentXml) return docxBuffer;

    zip.file("word/document.xml", normalizedXml);
    return Buffer.from(zip.generate({ type: "nodebuffer" }));
  } catch {
    return docxBuffer;
  }
}

function removeDocxParagraphKeepRules(paragraphXml: string) {
  return paragraphXml
    .replace(/<w:keepNext\/>/g, "")
    .replace(/<w:keepLines\/>/g, "");
}

function removeDocxParagraphNumbering(paragraphXml: string) {
  return paragraphXml.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, "");
}

function normalizeNr35ProgramItemText(text: string) {
  const cleanText = text.replace(/\s+;/g, ";").replace(/trabalhos altura/i, "trabalhos em altura").trim();
  const normalizedText = normalizeModelMarker(cleanText);

  if (normalizedText.includes("normas e regulamentos")) return `a) ${cleanText.replace(/^a\)\s*/i, "")}`;
  if (normalizedText.includes("analise de risco")) return `b) ${cleanText.replace(/^b\)\s*/i, "")}`;
  if (normalizedText.includes("riscos potenciais")) return `c) ${cleanText.replace(/^c\)\s*/i, "")}`;
  if (normalizedText.includes("equipamentos de protecao individual")) return `d) ${cleanText.replace(/^d\)\s*/i, "")}`;
  if (normalizedText.includes("acidentes tipicos") || normalizedText.includes("acidentes")) return `e) ${cleanText.replace(/^e\)\s*/i, "")}`;
  if (normalizedText.includes("condutas em situacoes")) return `f) ${cleanText.replace(/^f\)\s*/i, "")}`;

  return cleanText;
}

function buildSimpleCenteredDocxParagraph(
  text: string,
  fontSize: number,
  lineHeight: number,
  fontName = "Arial",
  italic = false,
) {
  const italicXml = italic ? "<w:i/>" : "";
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="${lineHeight}" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:eastAsia="${fontName}" w:cs="${fontName}"/><w:b/>${italicXml}<w:color w:val="000000"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:eastAsia="${fontName}" w:cs="${fontName}"/><w:b/>${italicXml}<w:color w:val="000000"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

async function markBrigadaOrganicaPdfIfNeeded(input: RenderInput, layout: TemplateLayout, pdfBuffer: Buffer) {
  if (!isBrigadaOrganicaLayout(input, layout)) return pdfBuffer;

  try {
    const pdf = await PDFDocument.load(pdfBuffer);
    const creator = pdf.getCreator() ?? "";
    pdf.setCreator(creator.includes(BRIGADA_ORGANICA_PDF_VERSION_MARKER)
      ? creator
      : [creator, BRIGADA_ORGANICA_PDF_VERSION_MARKER].filter(Boolean).join("; "));
    return Buffer.from(await pdf.save());
  } catch {
    return pdfBuffer;
  }
}

function normalizeBrigadaOrganicaHeader(zip: PizZip, documentXml: string) {
  const badgeRelationshipId = findBrigadaOrganicaBadgeRelationshipId(zip);
  if (!badgeRelationshipId) return documentXml;

  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/, (paragraphXml) => {
    if (!paragraphXml.includes("CERTIFICADO") || !paragraphXml.includes(`r:embed="${badgeRelationshipId}"`)) {
      return paragraphXml;
    }

    let normalizedParagraph = paragraphXml
      .replace(/<w:r\b(?:(?!<\/w:r>).)*?<w:t[^>]*>\s*<\/w:t>(?:(?!<\/w:r>).)*?<\/w:r>/g, "")
      .replace(/CERTIFICADO\s+/g, "CERTIFICADO");

    normalizedParagraph = bringBrigadaOrganicaTcsLogoToFront(normalizedParagraph);
    normalizedParagraph = normalizedParagraph.replace(
      new RegExp(`<wp:inline\\b[\\s\\S]*?<a:blip r:embed="${escapeRegExp(badgeRelationshipId)}"[\\s\\S]*?<\\/wp:inline>`),
      (inlineXml) => buildBrigadaOrganicaBadgeAnchor(inlineXml),
    );
    normalizedParagraph = alignBrigadaOrganicaCertificateTitle(normalizedParagraph);

    return ensureBrigadaOrganicaHeaderSpacing(normalizedParagraph);
  });
}

function alignBrigadaOrganicaCertificateTitle(paragraphXml: string) {
  return paragraphXml.replace(/<w:r\b[\s\S]*?CERTIFICADO[\s\S]*?<\/w:r>/, (runXml) => {
    const withoutExistingPosition = runXml.replace(/<w:position\b[^>]*\/>/g, "");

    return withoutExistingPosition.includes("<w:rPr>")
      ? withoutExistingPosition.replace("<w:rPr>", '<w:rPr><w:position w:val="-10"/>')
      : withoutExistingPosition.replace(/(<w:r\b[^>]*>)/, '$1<w:rPr><w:position w:val="-10"/></w:rPr>');
  });
}

function ensureBrigadaOrganicaHeaderSpacing(paragraphXml: string) {
  if (paragraphXml.includes('w:after="620"')) return paragraphXml;

  return paragraphXml.includes("<w:pPr>")
    ? paragraphXml.replace("<w:pPr>", '<w:pPr><w:spacing w:after="620"/>')
    : paragraphXml.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:spacing w:after="620"/></w:pPr>');
}

function bringBrigadaOrganicaTcsLogoToFront(paragraphXml: string) {
  return paragraphXml.replace(
    /<wp:anchor\b(?=[\s\S]*?<a:blip r:embed="rId12")[\s\S]*?<\/wp:anchor>/,
    (anchorXml) =>
      anchorXml
        .replace('behindDoc="1"', 'behindDoc="0"')
        .replace(/relativeHeight="\d+"/, 'relativeHeight="251664384"')
        .replace(/<wp:positionH relativeFrom="column"><wp:posOffset>-?\d+<\/wp:posOffset><\/wp:positionH>/, '<wp:positionH relativeFrom="column"><wp:posOffset>220000</wp:posOffset></wp:positionH>')
        .replace(/<wp:positionV relativeFrom="paragraph"><wp:posOffset>-?\d+<\/wp:posOffset><\/wp:positionV>/, '<wp:positionV relativeFrom="paragraph"><wp:posOffset>150000</wp:posOffset></wp:positionV>')
        .replace(/<wp:extent cx="\d+" cy="\d+"\/>/, '<wp:extent cx="1200000" cy="825000"/>')
        .replace(/<a:ext cx="\d+" cy="\d+"\/>/, '<a:ext cx="1200000" cy="825000"/>'),
  );
}

function buildBrigadaOrganicaBadgeAnchor(inlineXml: string) {
  const extent = inlineXml.match(/<wp:extent\b[^>]*\/>/)?.[0] ?? '<wp:extent cx="1002030" cy="911860"/>';
  const effectExtent = inlineXml.match(/<wp:effectExtent\b[^>]*\/>/)?.[0] ?? '<wp:effectExtent l="0" t="0" r="0" b="0"/>';
  const docPr = inlineXml.match(/<wp:docPr\b[^>]*\/>/)?.[0] ?? '<wp:docPr id="2" name="image2.png"/>';
  const graphicFramePr = inlineXml.match(/<wp:cNvGraphicFramePr\b[\s\S]*?<\/wp:cNvGraphicFramePr>|<wp:cNvGraphicFramePr\/>/)?.[0] ?? "<wp:cNvGraphicFramePr/>";
  const graphic = inlineXml.match(/<a:graphic\b[\s\S]*?<\/a:graphic>/)?.[0] ?? "";

  return [
    '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251663360" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">',
    '<wp:simplePos x="0" y="0"/>',
    '<wp:positionH relativeFrom="column"><wp:posOffset>8550000</wp:posOffset></wp:positionH>',
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>150000</wp:posOffset></wp:positionV>',
    extent,
    effectExtent,
    "<wp:wrapNone/>",
    docPr,
    graphicFramePr,
    graphic,
    "</wp:anchor>",
  ].join("");
}

function compactBrigadaOrganicaTableFonts(documentXml: string) {
  return documentXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, (tableXml) =>
    tableXml
      .replace(/<w:sz(?!Cs)([^>]*)w:val="(\d+)"([^>]*)\/>/g, (_match, before, value, after) => {
        const nextValue = compactBrigadaOrganicaFontSize(Number(value));
        return `<w:sz${before}w:val="${nextValue}"${after}/>`;
      })
      .replace(/<w:szCs([^>]*)w:val="(\d+)"([^>]*)\/>/g, (_match, before, value, after) => {
        const nextValue = compactBrigadaOrganicaFontSize(Number(value));
        return `<w:szCs${before}w:val="${nextValue}"${after}/>`;
      }),
  );
}

function compactBrigadaOrganicaSignatureParagraph(documentXml: string) {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const text = extractDocxParagraphText(paragraphXml);
    if (!text.includes("Carlos Alexandre") || !text.includes("CBMMG")) return paragraphXml;

    const compactedParagraph = paragraphXml
      .replace(/<w:sz(?!Cs)([^>]*)w:val="\d+"([^>]*)\/>/g, '<w:sz$1w:val="28"$2/>')
      .replace(/<w:szCs([^>]*)w:val="\d+"([^>]*)\/>/g, '<w:szCs$1w:val="28"$2/>');

    return ensureDocxParagraphProperty(
      compactedParagraph,
      '<w:keepLines/><w:spacing w:before="0" w:after="0" w:line="190" w:lineRule="auto"/>',
    );
  });
}

function addBrigadaOrganicaContentPageBreak(documentXml: string) {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const text = extractDocxParagraphText(paragraphXml);
    if (!normalizeModelMarker(text).includes("conteudo programatico") || paragraphXml.includes("<w:pageBreakBefore")) {
      return paragraphXml;
    }

    return ensureDocxParagraphProperty(paragraphXml, "<w:pageBreakBefore/>");
  });
}

function ensureDocxParagraphProperty(paragraphXml: string, propertyXml: string) {
  if (paragraphXml.includes("<w:pPr>")) {
    return paragraphXml.replace("<w:pPr>", `<w:pPr>${propertyXml}`);
  }

  return paragraphXml.replace(/(<w:p\b[^>]*>)/, `$1<w:pPr>${propertyXml}</w:pPr>`);
}

function extractDocxParagraphText(paragraphXml: string) {
  return Array.from(paragraphXml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g))
    .map((match) => match[1])
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function clipBrigadaOrganicaBadgeImage(zip: PizZip, documentXml: string) {
  const badgeRelationshipId = findBrigadaOrganicaBadgeRelationshipId(zip);
  if (!badgeRelationshipId) return documentXml;

  const badgePicturePattern = new RegExp(
    `(<pic:pic[\\s\\S]*?<a:blip r:embed="${escapeRegExp(badgeRelationshipId)}"[\\s\\S]*?<pic:spPr>[\\s\\S]*?<a:prstGeom )prst="rect"`,
    "g",
  );

  return documentXml.replace(badgePicturePattern, '$1prst="ellipse"');
}

function findBrigadaOrganicaBadgeRelationshipId(zip: PizZip) {
  const relationshipsXml = zip.file("word/_rels/document.xml.rels")?.asText();
  if (!relationshipsXml) return null;

  return Array.from(
    relationshipsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="media\/image3\.png"[^>]*\/>/g),
  )[0]?.[1] ?? null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function renderSuporteBasicoVidaPdf(input: RenderInput, layout: TemplateLayout) {
  const pdfDocument = await PDFDocument.create();
  pdfDocument.setCreator("TCS Controlled Renderer");
  const page = pdfDocument.addPage([595.303937007874, 841.889763779528]);
  const fonts = await embedPortablePdfFonts(pdfDocument);
  const values = buildRenderValues(input);
  const assets = await readDocxMediaAssets(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  const tcsLogo = assets.get("image1.jpeg") ?? assets.get("image4.jpeg");
  const watermark = assets.get("image4.jpeg") ?? tcsLogo;
  const medicalLogo = assets.get("image2.png");
  const signature = assets.get("image3.png");
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  page.drawRectangle({
    x: 24,
    y: 24,
    width: pageWidth - 48,
    height: pageHeight - 48,
    borderColor: rgb(1, 0, 0),
    borderWidth: 4,
  });

  if (watermark) {
    const image = await embedPdfImageBuffer(pdfDocument, watermark.buffer, watermark.name);
    page.drawImage(image, { x: -8, y: 214, width: 612, height: 421, opacity: 0.18 });
  }

  if (tcsLogo) {
    const image = await embedPdfImageBuffer(pdfDocument, tcsLogo.buffer, tcsLogo.name);
    page.drawImage(image, { x: 43, y: 713, width: 100, height: 69 });
  }

  if (medicalLogo) {
    const image = await embedPdfImageBuffer(pdfDocument, medicalLogo.buffer, medicalLogo.name);
    page.drawImage(image, { x: 473, y: 704, width: 76, height: 76 });
  }

  drawCenteredPdfText(page, "CERTIFICADO", 681, fonts.bold, 40);
  drawCenteredPdfText(page, "Curso de  Suporte   Básico de Vida", 630, fonts.bold, 14);

  const name = values.nome ?? values.NOME ?? "";
  const hours = values.horas ?? values.HORAS ?? "";
  const city = values.cidade ?? values.CIDADE ?? "";
  const date = values.data_extenso ?? values.DATA_EXTENSO ?? values.data ?? "";
  const cpf = values.cpf ?? values.CPF ?? "";
  const verificationCode = values.COD ?? values.codigo ?? input.verificationCode;

  const bodyText = `A TCS Cursos e Serviços confere que o Sr.(a) ${name} participou do Curso de Suporte Básico de Vida com ênfase em RCP (Reanimação Cardiopulmonar), PCR (parada cardiorrespiratória), avaliação da cena, cinemática do trauma, convulsão, OVACE e desmaio, de acordo com as Diretrizes e Protocolos da Sociedade Brasileira de Terapia Intensiva - SOBRATI, com carga horária de ${hours} horas, estando habilitado ao atendimento básico na emergência cardiovascular, com embasamento na Lei 9.394/96.`;

  drawWrappedPdfText(page, bodyText, {
    x: 35,
    y: 568,
    width: 526,
    font: fonts.regular,
    size: 12.4,
    lineHeight: 18.5,
    justify: true,
  });

  page.drawText("Decreto 5.154/04 deliberação CEE 14/97 - Curso Livre de aperfeiçoamento Profissional.", {
    x: 35,
    y: 413,
    size: 12.4,
    font: fonts.regular,
    color: rgb(0, 0, 0),
  });

  page.drawText(`${city}, ${date}.`, {
    x: 35,
    y: 357,
    size: 13,
    font: fonts.regular,
    color: rgb(0, 0, 0),
  });

  if (signature) {
    const image = await embedPdfImageBuffer(pdfDocument, signature.buffer, signature.name);
    page.drawImage(image, { x: 61, y: 268, width: 105, height: 43 });
  }

  const instructorLines = [
    "Carlos Alexandre R. Faria",
    "Reg.MTE0056818/MG",
    "Coren MG 001.312.974",
    "Reg. CBMMG Nº F 0004348",
  ];
  instructorLines.forEach((line, index) => {
    page.drawText(line, {
      x: 35,
      y: 259 - index * 17,
      size: 12.8,
      font: fonts.regular,
      color: rgb(0, 0, 0),
    });
  });

  page.drawText("Aluno(a)", { x: 440, y: 250, size: 12.8, font: fonts.regular, color: rgb(0, 0, 0) });
  page.drawText(`CPF${cpf ? ` ${cpf}` : ""}`, { x: 365, y: 219, size: 12.8, font: fonts.regular, color: rgb(0, 0, 0) });
  page.drawLine({ start: { x: 394, y: 216 }, end: { x: 543, y: 216 }, thickness: 0.75, color: rgb(0, 0, 0) });

  drawCenteredPdfText(
    page,
    "T.C.S   CURSOS E SERVIÇOS  CNPJ 32.340.932/0001-70   RUA: ABÍLIO TAVARES PIRES Nº199",
    118,
    fonts.regular,
    9.2,
  );
  drawCenteredPdfText(
    page,
    "BAIRRO : CENTENÁRIO     CIDADE : CATAGUASES - M. G  CEL: (32) 99996-7877 -(32) 98490-5610",
    104,
    fonts.regular,
    9.2,
  );
  drawCenteredPdfText(page, "Certificado válido apenas com a assinatura e CPF do aluno.", 76, fonts.regular, 9.2);
  drawCenteredPdfText(page, `Numeração:${verificationCode}`, 64, fonts.regular, 9.2);

  return Buffer.from(await pdfDocument.save());
}

async function convertDocxToPdfWithFallbacks(docxBuffer: Buffer) {
  const gotenbergPdf = await convertDocxToPdfWithGotenberg(docxBuffer);
  if (gotenbergPdf) return Buffer.from(gotenbergPdf);

  const libreOfficePdf = await convertDocxToPdfBuffer(docxBuffer);
  if (libreOfficePdf) return Buffer.from(libreOfficePdf);

  const graphPdf = await convertDocxToPdfWithMicrosoftGraph(docxBuffer);
  if (graphPdf) return Buffer.from(graphPdf);

  const cloudConvertPdf = await convertOfficeToPdfWithCloudConvert({
    buffer: docxBuffer,
    inputFormat: "docx",
    fileName: "certificate.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    engine: "office",
  });
  if (cloudConvertPdf) return Buffer.from(cloudConvertPdf);

  const iLoveApiPdf = await convertOfficeToPdfWithILoveApi({
    buffer: docxBuffer,
    inputFormat: "docx",
    fileName: "certificate.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  if (iLoveApiPdf) return Buffer.from(iLoveApiPdf);

  return null;
}

function getExpectedPdfPageCount(layout: TemplateLayout) {
  const basePageCount = layout.basePages?.length ?? 0;
  const elementPageCount = getElementPageCount(layout);

  return Math.max(1, basePageCount, elementPageCount);
}

function getExpectedNativeDocxPdfPageCount(input: RenderInput, layout: TemplateLayout) {
  if (isBrigadaOrganicaLayout(input, layout)) {
    return Math.max(2, getElementPageCount(layout));
  }

  if (isInstrutorPrimeirosSocorrosLayout(input, layout)) {
    return Math.max(2, getElementPageCount(layout));
  }

  if (isNr35Layout(input, layout)) {
    return 2;
  }

  return getExpectedPdfPageCount(layout);
}

function getElementPageCount(layout: TemplateLayout) {
  return Math.max(0, ...layout.elements.map((element) => element.pageIndex ?? 0)) + 1;
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

async function trimNativePdfToPageCount(pdfBuffer: Buffer, expectedPageCount: number) {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const outputPdf = await PDFDocument.create();
  const copiedPages = await outputPdf.copyPages(
    sourcePdf,
    Array.from({ length: expectedPageCount }, (_, index) => index),
  );

  for (const page of copiedPages) outputPdf.addPage(page);

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
  return convertNativePptxToPdfBuffer(pptxBuffer, layout);
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

function renderDocxFromBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const zip = new PizZip(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  applyDocxAssetReplacementsToZip(zip, layout);
  repairDocxTemplateDelimiterTypos(zip);
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

function repairDocxTemplateDelimiterTypos(zip: PizZip) {
  for (const filePath of ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"]) {
    const file = zip.file(filePath);
    const xml = file?.asText();
    if (!xml) continue;

    const repairedXml = xml.replace(
      /(?<!\{)\{([A-Za-z0-9_\u00c0-\u017f ]+)\}\}/g,
      (_match, rawKey: string) => `{{${rawKey.trim()}}}`,
    );

    if (repairedXml !== xml) zip.file(filePath, repairedXml);
  }
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
) {
  const mimeType = layout.baseFileType || "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  const gotenbergPdf = await convertOfficeToPdfWithGotenberg({
    buffer: pptxBuffer,
    fileName: "certificate.pptx",
    mimeType,
  });
  if (gotenbergPdf) return Buffer.from(gotenbergPdf);

  const libreOfficePdf = await convertOfficeToPdfBuffer(pptxBuffer, "pptx");
  if (libreOfficePdf) return Buffer.from(libreOfficePdf);

  const cloudConvertPdf = await convertOfficeToPdfWithCloudConvert({
    buffer: pptxBuffer,
    inputFormat: "pptx",
    fileName: "certificate.pptx",
    mimeType,
    engine: "office",
  });
  if (cloudConvertPdf) return Buffer.from(cloudConvertPdf);

  const iLoveApiPdf = await convertOfficeToPdfWithILoveApi({
    buffer: pptxBuffer,
    inputFormat: "pptx",
    fileName: "certificate.pptx",
    mimeType,
  });
  if (iLoveApiPdf) return Buffer.from(iLoveApiPdf);

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
  return expandRenderValueAliases({
    ...input.values,
    ...buildVerificationTemplateValues(input.verificationCode),
  });
}

function expandRenderValueAliases(values: Record<string, string>) {
  const expanded = { ...values };

  for (const [key, value] of Object.entries(values)) {
    const normalizedKey = normalizeVariableKey(key);
    if (normalizedKey && expanded[normalizedKey] === undefined) {
      expanded[normalizedKey] = value;
    }
  }

  return expanded;
}

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

async function readDocxMediaAssets(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const assets = new Map<string, { name: string; buffer: Buffer }>();

  for (const name of Object.keys(zip.files)) {
    if (!/^word\/media\/[^/]+\.(png|jpe?g)$/i.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const buffer = Buffer.from(await file.async("nodebuffer"));
    assets.set(name.split("/").at(-1)?.toLowerCase() ?? name.toLowerCase(), { name, buffer });
  }

  return assets;
}

async function embedPdfImageBuffer(pdfDocument: PDFDocument, buffer: Buffer, name: string) {
  return name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg")
    ? pdfDocument.embedJpg(buffer)
    : pdfDocument.embedPng(buffer);
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

async function embedPortablePdfFonts(pdfDocument: PDFDocument): Promise<EmbeddedPdfFonts> {
  try {
    // fontkit does not ship TypeScript declarations, but pdf-lib needs it for TTF embedding.
    // @ts-expect-error fontkit is available at runtime through the project dependencies.
    const fontkitModule = await import("fontkit");
    pdfDocument.registerFontkit(fontkitModule.default ?? fontkitModule);

    const fontDir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
    const [regularBytes, boldBytes, italicBytes, boldItalicBytes] = await Promise.all([
      readFile(path.join(fontDir, "LiberationSans-Regular.ttf")),
      readFile(path.join(fontDir, "LiberationSans-Bold.ttf")),
      readFile(path.join(fontDir, "LiberationSans-Italic.ttf")),
      readFile(path.join(fontDir, "LiberationSans-BoldItalic.ttf")),
    ]);

    const [regular, bold, italic, boldItalic] = await Promise.all([
      pdfDocument.embedFont(regularBytes),
      pdfDocument.embedFont(boldBytes),
      pdfDocument.embedFont(italicBytes),
      pdfDocument.embedFont(boldItalicBytes),
    ]);

    return { regular, bold, italic, boldItalic };
  } catch (error) {
    console.warn("Fonte TTF portavel indisponivel; usando fontes PDF padrao.", error);
    return embedPdfFonts(pdfDocument);
  }
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

function drawCenteredPdfText(page: PDFPage, text: string, y: number, font: PDFFont, size: number) {
  const x = (page.getWidth() - font.widthOfTextAtSize(text, size)) / 2;
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
}

function drawWrappedPdfText(
  page: PDFPage,
  text: string,
  {
    x,
    y,
    width,
    font,
    size,
    lineHeight,
    justify = false,
  }: {
    x: number;
    y: number;
    width: number;
    font: PDFFont;
    size: number;
    lineHeight: number;
    justify?: boolean;
  },
) {
  const lines = wrapPdfText(text, font, size, width);
  lines.forEach((line, index) => {
    const lineY = y - index * lineHeight;
    const shouldJustify = justify && index < lines.length - 1 && line.includes(" ");

    if (!shouldJustify) {
      page.drawText(line, { x, y: lineY, size, font, color: rgb(0, 0, 0) });
      return;
    }

    const words = line.trim().split(/\s+/);
    const wordsWidth = words.reduce((total, word) => total + font.widthOfTextAtSize(word, size), 0);
    const gap = words.length > 1 ? Math.max(0, (width - wordsWidth) / (words.length - 1)) : 0;
    let cursorX = x;

    for (const word of words) {
      page.drawText(word, { x: cursorX, y: lineY, size, font, color: rgb(0, 0, 0) });
      cursorX += font.widthOfTextAtSize(word, size) + gap;
    }
  });
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
            ? resolveTemplateValue(element.variableKey, values)
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
