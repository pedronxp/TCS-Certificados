import { Document, Packer, Paragraph, TextRun } from "docx";
import Docxtemplater from "docxtemplater";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import PizZip from "pizzip";
import QRCode from "qrcode";
import { fillTemplateText, normalizeVariableKey, templateLayoutSchema, type TemplateLayout } from "@/lib/certificate-layout";
import { convertDocxToPdfWithCloudConvert } from "@/lib/cloudconvert";
import { convertDocxToPdfBuffer } from "@/lib/libreoffice";
import { convertDocxToPdfWithGotenberg } from "@/lib/gotenberg";
import { convertDocxToPdfWithMicrosoftGraph } from "@/lib/microsoft-graph";
import { buildVerificationTemplateValues } from "@/lib/verification-code";

export const DOCX_PDF_CONVERTER_UNAVAILABLE_MESSAGE =
  "Conversor DOCX para PDF indisponivel. Configure MICROSOFT_GRAPH_*, CLOUDCONVERT_API_KEY, GOTENBERG_URL com uma API Gotenberg externa ou LIBREOFFICE_PATH em um servidor com LibreOffice.";

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

export async function renderCertificateHtml(input: RenderInput) {
  const layout = templateLayoutSchema.parse(input.template.layout);
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
  const layout = templateLayoutSchema.parse(input.template.layout);
  if (layout.baseFileType === "application/pdf" && layout.baseFileDataUrl) {
    return renderPdfFromBaseTemplate(input, layout);
  }
  if (isNativeDocxBaseLayout(layout)) {
    const nativePdf = await renderPdfFromNativeDocxBaseTemplate(input, layout);
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
    console.warn("Playwright indisponível; usando fallback pdf-lib.", error);
    return renderPdfFallback(input, layout);
  }
}

export async function renderDocxBuffer(input: RenderInput) {
  const layout = templateLayoutSchema.parse(input.template.layout);
  if (isNativeDocxBaseLayout(layout)) {
    return renderDocxFromBaseTemplate(input, layout);
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

async function renderPdfFromBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const pdfDocument = await PDFDocument.load(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  const firstPage = pdfDocument.getPage(0);
  const { width: pageWidth, height: pageHeight } = firstPage.getSize();
  const fonts = await embedPdfFonts(pdfDocument);
  const validationUrl = `${input.appUrl.replace(/\/$/, "")}/validar/${input.verificationCode}`;
  const qrDataUrl = await QRCode.toDataURL(validationUrl, { margin: 1, width: 260 });
  const qrImage = await pdfDocument.embedPng(dataUrlToBuffer(qrDataUrl));
  const values = buildRenderValues(input);

  for (const element of layout.elements) {
    const x = (element.x / input.template.width) * pageWidth;
    const yFromTop = (element.y / input.template.height) * pageHeight;
    const elementWidth = (element.width / input.template.width) * pageWidth;
    const elementHeight = (element.height / input.template.height) * pageHeight;
    const fontSize = (element.fontSize / input.template.height) * pageHeight;

    if (element.type === "qr") {
      firstPage.drawImage(qrImage, {
        x,
        y: pageHeight - yFromTop - elementHeight,
        width: Math.min(elementWidth, elementHeight),
        height: Math.min(elementWidth, elementHeight),
      });
      continue;
    }

    if (element.type === "image") continue;

    drawPdfTextElement(firstPage, {
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
  const microsoftGraphPdf = await convertDocxToPdfWithMicrosoftGraph(docxBuffer);
  if (microsoftGraphPdf) return Buffer.from(microsoftGraphPdf);
  const cloudConvertPdf = await convertDocxToPdfWithCloudConvert(docxBuffer);
  if (cloudConvertPdf) return Buffer.from(cloudConvertPdf);
  const gotenbergPdf = await convertDocxToPdfWithGotenberg(docxBuffer);
  if (gotenbergPdf) return Buffer.from(gotenbergPdf);
  const libreOfficePdf = await convertDocxToPdfBuffer(docxBuffer);
  if (libreOfficePdf) return Buffer.from(libreOfficePdf);
  return null;
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

  for (const element of layout.elements) {
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
  const basePreview = layout.baseFileType?.includes("wordprocessingml") && layout.basePreviewHtml && !layout.baseFileDataUrl
    ? `<div class="base-preview">${fillTemplateHtml(layout.basePreviewHtml, values)}</div>`
    : "";
  const baseImage = layout.baseImageDataUrl
    ? `<img src="${escapeHtml(layout.baseImageDataUrl)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:fill;" />`
    : "";
  const showGeneratedFrame = !background && !layout.baseImageDataUrl && !layout.baseFileDataUrl && !layout.basePreviewHtml;
  const generatedFrameCss = showGeneratedFrame
    ? ".page:before{content:\"\";position:absolute;inset:24px;border:2px solid #0f766e;pointer-events:none}.page:after{content:\"\";position:absolute;inset:38px;border:1px solid #94a3b8;pointer-events:none}"
    : "";
  const baseBorder = layout.basePageBorder
    ? `<div style="position:absolute;inset:${layout.basePageBorder.inset}px;border:${layout.basePageBorder.width}px solid ${layout.basePageBorder.color};pointer-events:none;"></div>`
    : "";

  const elements = layout.elements
    .map((element) => {
      const common = `position:absolute;left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;color:${element.color};font-family:${element.fontFamily};font-size:${element.fontSize}px;font-weight:${element.bold ? 700 : 400};font-style:${element.italic ? "italic" : "normal"};text-decoration:${element.underline ? "underline" : "none"};text-align:${element.align};display:flex;align-items:${element.type === "text" ? "flex-start" : "center"};justify-content:${justify(element.align)};overflow:hidden;white-space:pre-wrap;word-break:break-word;line-height:${resolveLineHeight(element.lineHeight)};`;

      if (element.type === "image") {
        return `<img src="${escapeHtml(element.content)}" style="${common};object-fit:contain;" />`;
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

  return `<!doctype html><html><head><meta charset="utf-8" /><style>*{box-sizing:border-box}body{margin:0;background:#fff}.page{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${background || layout.baseImageDataUrl ? "#fff" : "#f8fafc"};${background ? `background-image:url('${background}');background-size:cover;background-position:center;` : ""}}${generatedFrameCss}.base-preview{position:absolute;inset:0;overflow:hidden;background:#fff;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.45}.base-preview p{margin:0 0 10px}.base-preview table{border-collapse:collapse;width:100%}.base-preview td,.base-preview th{border:1px solid #cbd5e1;padding:6px}.base-preview h1,.base-preview h2,.base-preview h3{margin:0 0 12px}</style></head><body><main class="page">${baseImage}${basePreview}${baseBorder}${elements}</main></body></html>`;
}

function justify(align: "left" | "center" | "right") {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
}

function isNativeDocxBaseLayout(layout: TemplateLayout) {
  return layout.baseDocumentMode !== "editable" && Boolean(layout.baseFileType?.includes("wordprocessingml") && layout.baseFileDataUrl);
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

function expandTemplateValues(values: Record<string, string>, sourceText: string) {
  const expanded = { ...values };

  for (const match of sourceText.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const originalKey = String(match[1]).trim();
    const normalizedKey = normalizeVariableKey(originalKey);
    if (expanded[originalKey] === undefined && values[normalizedKey] !== undefined) {
      expanded[originalKey] = values[normalizedKey];
    }
  }

  return expanded;
}
