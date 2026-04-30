import { Document, Packer, Paragraph, TextRun } from "docx";
import Docxtemplater from "docxtemplater";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import { extractVariableKeys, fillTemplateText, normalizeVariableKey, stripQrElements, templateLayoutSchema, type TemplateLayout } from "@/lib/certificate-layout";

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
  const layout = stripQrElements(templateLayoutSchema.parse(input.template.layout));

  return certificateHtml({
    layout,
    width: input.template.width,
    height: input.template.height,
    background: input.template.background,
    values: input.values,
  });
}

export async function renderPdfBuffer(input: RenderInput) {
  const layout = stripQrElements(templateLayoutSchema.parse(input.template.layout));
  if (layout.baseFileType === "application/pdf" && layout.baseFileDataUrl) {
    return renderPdfFromBaseTemplate(input, layout);
  }

  try {
    const html = await renderCertificateHtml(input);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: input.template.width, height: input.template.height },
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      width: `${input.template.width}px`,
      height: `${input.template.height}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await browser.close();
    return Buffer.from(pdf);
  } catch (error) {
    console.warn("Playwright indisponível; usando fallback pdf-lib.", error);
    return renderPdfFallback(input, layout);
  }
}

export async function renderDocxBuffer(input: RenderInput) {
  const layout = stripQrElements(templateLayoutSchema.parse(input.template.layout));
  if (layout.baseFileType?.includes("wordprocessingml") && layout.baseFileDataUrl) {
    return renderDocxFromBaseTemplate(input, layout);
  }

  const lines = layout.elements
    .filter((element) => element.type !== "image" && element.type !== "qr")
    .map((element) =>
      element.type === "variable" && element.variableKey
        ? input.values[element.variableKey] ?? ""
        : fillTemplateText(element.content, input.values),
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
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);

  for (const element of layout.elements) {
    const x = (element.x / input.template.width) * pageWidth;
    const yFromTop = (element.y / input.template.height) * pageHeight;
    const elementWidth = (element.width / input.template.width) * pageWidth;
    const elementHeight = (element.height / input.template.height) * pageHeight;
    const fontSize = (element.fontSize / input.template.height) * pageHeight;
    const y = pageHeight - yFromTop - elementHeight + Math.max(4, elementHeight / 2 - fontSize / 2);

    if (element.type === "qr") {
      continue;
    }

    if (element.type === "image") continue;

    const text =
      element.type === "variable" && element.variableKey
        ? input.values[element.variableKey] ?? ""
        : fillTemplateText(element.content, input.values);
    const font = element.bold ? boldFont : regularFont;
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textX =
      element.align === "right"
        ? x + Math.max(0, elementWidth - textWidth)
        : element.align === "center"
          ? x + Math.max(0, (elementWidth - textWidth) / 2)
          : x;

    firstPage.drawText(text, {
      x: textX,
      y,
      size: fontSize,
      font,
      color: hexToRgb(element.color),
      maxWidth: elementWidth,
    });
  }

  return Buffer.from(await pdfDocument.save());
}

async function renderPdfFallback(input: RenderInput, layout: TemplateLayout) {
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([input.template.width, input.template.height]);
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);

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
    const y = input.template.height - element.y - element.height + Math.max(4, element.height / 2 - element.fontSize / 2);

    if (element.type === "qr") {
      continue;
    }

    if (element.type === "image") continue;

    const text =
      element.type === "variable" && element.variableKey
        ? input.values[element.variableKey] ?? ""
        : fillTemplateText(element.content, input.values);
    const font = element.bold ? boldFont : regularFont;
    const textWidth = font.widthOfTextAtSize(text, element.fontSize);
    const x =
      element.align === "right"
        ? element.x + Math.max(0, element.width - textWidth)
        : element.align === "center"
          ? element.x + Math.max(0, (element.width - textWidth) / 2)
          : element.x;

    page.drawText(text, {
      x,
      y,
      size: element.fontSize,
      font,
      color: hexToRgb(element.color),
      maxWidth: element.width,
    });
  }

  return Buffer.from(await pdfDocument.save());
}

function renderDocxFromBaseTemplate(input: RenderInput, layout: TemplateLayout) {
  const zip = new PizZip(dataUrlToBuffer(layout.baseFileDataUrl ?? ""));
  const document = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });

  document.render({
    ...expandTemplateValues(input.values, layout.basePreviewHtml ?? ""),
    verificationCode: input.verificationCode,
    codigo_validacao: input.verificationCode,
  });

  return Buffer.from(document.getZip().generate({ type: "nodebuffer" }));
}

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
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
}: {
  layout: TemplateLayout;
  width: number;
  height: number;
  background: string | null;
  values: Record<string, string>;
}) {
  const basePreview = layout.baseFileType?.includes("wordprocessingml") && layout.basePreviewHtml
    ? `<div class="base-preview">${fillTemplateHtml(layout.basePreviewHtml, values)}</div>`
    : "";
  const baseVariableKeys = new Set(extractVariableKeys(layout.basePreviewHtml ?? ""));

  const elements = layout.elements
    .map((element) => {
      const common = `position:absolute;left:${element.x}px;top:${element.y}px;width:${element.width}px;height:${element.height}px;color:${element.color};font-family:${element.fontFamily};font-size:${element.fontSize}px;font-weight:${element.bold ? 700 : 400};text-align:${element.align};display:flex;align-items:center;justify-content:${justify(element.align)};overflow:hidden;`;

      if (element.type === "image") {
        return `<img src="${escapeHtml(element.content)}" style="${common};object-fit:contain;" />`;
      }

      if (element.type === "qr") {
        return "";
      }

      if (element.type === "variable" && element.variableKey && baseVariableKeys.has(element.variableKey)) {
        return "";
      }

      const text =
        element.type === "variable" && element.variableKey
          ? values[element.variableKey] ?? ""
          : fillTemplateText(element.content, values);

      return `<div style="${common};line-height:1.15;">${escapeHtml(text)}</div>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" /><style>*{box-sizing:border-box}body{margin:0;background:#fff}.page{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#f8fafc;${background ? `background-image:url('${background}');background-size:cover;background-position:center;` : ""}.page:before{content:"";position:absolute;inset:24px;border:2px solid #0f766e;pointer-events:none}.page:after{content:"";position:absolute;inset:38px;border:1px solid #94a3b8;pointer-events:none}.base-preview{position:absolute;inset:0;overflow:hidden;background:#fff;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.45}.base-preview p{margin:0 0 10px}.base-preview table{border-collapse:collapse;width:100%}.base-preview td,.base-preview th{border:1px solid #cbd5e1;padding:6px}.base-preview h1,.base-preview h2,.base-preview h3{margin:0 0 12px}</style></head><body><main class="page">${basePreview}${elements}</main></body></html>`;
}

function justify(align: "left" | "center" | "right") {
  if (align === "left") return "flex-start";
  if (align === "right") return "flex-end";
  return "center";
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
