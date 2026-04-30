import { extractVariableKeys } from "@/lib/certificate-layout";
import type { TemplateElement, TemplatePageBorder } from "@/lib/certificate-layout";

type ExtractedDocumentPage = {
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  border?: TemplatePageBorder;
};

type ExtractedDocumentPreview = {
  previewHtml?: string;
  editable: boolean;
  elements: TemplateElement[];
  page?: ExtractedDocumentPage;
  renderDataUrl?: string;
  renderFileType?: string;
  renderEngine?: string;
  imageDataUrl?: string;
  imageEngine?: string;
  variables?: string[];
};

export async function extractDocumentPreview(file: File): Promise<ExtractedDocumentPreview> {
  if (!isDocx(file)) {
    return {
      previewHtml: undefined,
      editable: false,
      elements: [] as TemplateElement[],
      page: undefined as ExtractedDocumentPage | undefined,
    };
  }

  const serverPreview = await extractDocumentPreviewFromApi(file);
  if (serverPreview) return serverPreview;

  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const previewHtml = rawTextToPreviewHtml(result.value);
  const page = await extractDocxPage(arrayBuffer);

  return {
    previewHtml,
    editable: false,
    elements: [] as TemplateElement[],
    page,
    variables: extractVariableKeys(result.value),
  };
}

async function extractDocumentPreviewFromApi(file: File): Promise<ExtractedDocumentPreview | null> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/templates/docx-preview", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) return null;

    const preview = await response.json() as {
      previewHtml?: string;
      renderDataUrl?: string;
      renderFileType?: string;
      renderEngine?: string;
      imageDataUrl?: string;
      imageEngine?: string;
      page?: ExtractedDocumentPage;
      variables?: string[];
    };

    return {
      previewHtml: preview.previewHtml,
      renderDataUrl: preview.renderDataUrl,
      renderFileType: preview.renderFileType,
      renderEngine: preview.renderEngine,
      imageDataUrl: preview.imageDataUrl,
      imageEngine: preview.imageEngine,
      page: preview.page,
      editable: false,
      elements: [],
      variables: preview.variables ?? extractVariableKeys(preview.previewHtml ?? ""),
    };
  } catch (error) {
    console.warn("Preview DOCX via API indisponivel; usando fallback no navegador.", error);
    return null;
  }
}

function isDocx(file: File) {
  return (
    file.type.includes("wordprocessingml") ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

async function extractDocxPage(arrayBuffer: ArrayBuffer): Promise<ExtractedDocumentPage | undefined> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml || typeof DOMParser === "undefined") return undefined;

  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const sectionProperties = Array.from(document.getElementsByTagNameNS(WORD_NS, "sectPr")).at(-1);
  if (!sectionProperties) return undefined;

  const pageSize = sectionProperties.getElementsByTagNameNS(WORD_NS, "pgSz")[0];
  const widthTwips = readWordNumber(pageSize, "w");
  const heightTwips = readWordNumber(pageSize, "h");
  if (!widthTwips || !heightTwips) return undefined;

  const width = Math.round(widthTwips / 15);
  const height = Math.round(heightTwips / 15);
  const explicitOrientation = readWordAttribute(pageSize, "orient");
  const orientation = explicitOrientation === "portrait" || explicitOrientation === "landscape"
    ? explicitOrientation
    : width >= height ? "landscape" : "portrait";

  return {
    width,
    height,
    orientation,
    border: readPageBorder(sectionProperties),
  };
}

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function readPageBorder(sectionProperties: Element): TemplatePageBorder | undefined {
  const pageBorders = sectionProperties.getElementsByTagNameNS(WORD_NS, "pgBorders")[0];
  const border = pageBorders?.getElementsByTagNameNS(WORD_NS, "top")[0];
  if (!border) return undefined;

  const style = readWordAttribute(border, "val");
  if (!style || style === "nil" || style === "none") return undefined;

  const rawColor = readWordAttribute(border, "color");
  const color = rawColor && rawColor !== "auto" ? `#${rawColor.replace("#", "")}` : "#000000";
  const rawWidth = readWordNumber(border, "sz") ?? 8;
  const rawInset = readWordNumber(border, "space") ?? 0;

  return {
    color,
    width: Math.max(1, Math.round(rawWidth / 6)),
    inset: Math.max(0, Math.round(rawInset * 4 / 3)),
  };
}

function readWordNumber(element: Element | undefined, key: string) {
  const value = readWordAttribute(element, key);
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readWordAttribute(element: Element | undefined, key: string) {
  return element?.getAttributeNS(WORD_NS, key) ?? element?.getAttribute(`w:${key}`) ?? element?.getAttribute(key);
}

export function htmlPreviewToEditableElements(html: string): TemplateElement[] {
  if (typeof DOMParser === "undefined") return [];

  const document = new DOMParser().parseFromString(html, "text/html");
  const elements: TemplateElement[] = [];
  let y = 36;

  for (const block of Array.from(document.body.children)) {
    const images = Array.from(block.querySelectorAll("img"));

    for (const image of images) {
      const width = clamp(readSize(image, "width") ?? 260, 80, 520);
      const height = clamp(readSize(image, "height") ?? 120, 40, 240);
      const align = readAlign(block);

      elements.push({
        id: `image-${crypto.randomUUID()}`,
        type: "image",
        content: image.getAttribute("src") ?? "",
        variableRequired: true,
        x: align === "center" ? Math.round((1123 - width) / 2) : align === "right" ? 1123 - width - 70 : 70,
        y,
        width,
        height,
        fontSize: 12,
        fontFamily: "Arial",
        color: "#111827",
        align: "center",
        bold: false,
      });
      y += height + 18;
    }

    const text = normalizeText(readBlockText(block));
    if (!text) continue;

    const tagName = block.tagName.toLowerCase();
    const align = readAlign(block);
    const bold = tagName.startsWith("h") || text.length < 40;
    const fontSize = tagName === "h1" ? 30 : tagName === "h2" ? 24 : text.length < 40 ? 17 : 14;
    const width = 983;
    const lineCount = Math.max(1, Math.ceil(text.length / Math.max(45, Math.floor(width / (fontSize * 0.52)))));
    const height = Math.max(28, Math.ceil(lineCount * fontSize * 1.45));

    elements.push({
      id: `text-${crypto.randomUUID()}`,
      type: "text",
      content: text,
      variableRequired: true,
      x: 70,
      y,
      width,
      height,
      fontSize,
      fontFamily: "Arial",
      color: "#000000",
      align,
      bold,
    });
    y += height + 12;
  }

  return fitElementsToPage(elements);
}

function readBlockText(element: Element) {
  if (element.tagName.toLowerCase() === "table") {
    return Array.from(element.querySelectorAll("tr"))
      .map((row) =>
        Array.from(row.querySelectorAll("td,th"))
          .map((cell) => cell.textContent?.trim() ?? "")
          .filter(Boolean)
          .join("   "),
      )
      .filter(Boolean)
      .join("\n");
  }

  return element.textContent ?? "";
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rawTextToPreviewHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => normalizeText(paragraph))
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readAlign(element: Element): "left" | "center" | "right" {
  const style = element.getAttribute("style")?.toLowerCase() ?? "";
  if (style.includes("text-align:center") || style.includes("text-align: center")) return "center";
  if (style.includes("text-align:right") || style.includes("text-align: right")) return "right";
  return "left";
}

function readSize(element: Element, key: "width" | "height") {
  const attribute = Number(element.getAttribute(key));
  if (Number.isFinite(attribute) && attribute > 0) return attribute;

  const style = element.getAttribute("style") ?? "";
  const match = style.match(new RegExp(`${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, "i"));
  return match ? Number(match[1]) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function fitElementsToPage(elements: TemplateElement[]) {
  const top = 36;
  const bottom = 758;
  const maxBottom = Math.max(...elements.map((element) => element.y + element.height), bottom);
  if (maxBottom <= bottom) return elements;

  const ratio = Math.max(0.72, (bottom - top) / (maxBottom - top));

  return elements.map((element) => {
    if (element.type === "qr") return element;

    const y = Math.round(top + (element.y - top) * ratio);
    const height = Math.max(18, Math.round(element.height * ratio));
    const fontSize = element.type === "text" || element.type === "variable"
      ? Math.max(9, Math.round(element.fontSize * ratio))
      : element.fontSize;

    return {
      ...element,
      y,
      height,
      fontSize,
    };
  });
}

export function dataUrlToHtmlDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111827;line-height:1.5}p{margin:0 0 12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px}h1,h2,h3{margin:0 0 12px}</style></head><body>${html}</body></html>`;
}
