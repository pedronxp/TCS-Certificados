import { extractVariableKeys } from "@/lib/certificate-layout";
import type { TemplateElement, TemplatePageBorder } from "@/lib/certificate-layout";

export type ExtractedDocumentPage = {
  index?: number;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  imageDataUrl?: string;
  border?: TemplatePageBorder;
};

type ExtractedDocumentPreview = {
  previewHtml?: string;
  editable: boolean;
  elements: TemplateElement[];
  page?: ExtractedDocumentPage;
  pages?: ExtractedDocumentPage[];
  renderDataUrl?: string;
  renderFileType?: string;
  renderEngine?: string;
  imageDataUrl?: string;
  imageEngine?: string;
  variables?: string[];
  converterOffline?: boolean;
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

  const arrayBuffer = await file.arrayBuffer();
  const serverPreview = await extractDocumentPreviewFromApi(file);
  if (serverPreview) {
    const page = serverPreview.page ?? await extractDocxPage(arrayBuffer);
    const pages = normalizeExtractedPages(serverPreview.pages, page);
    const elements = serverPreview.editable
      ? serverPreview.elements.length > 0
        ? serverPreview.elements
        : await extractEditableElementsSafely(arrayBuffer, page)
      : [];

    return {
      ...serverPreview,
      editable: elements.length > 0,
      elements,
      page: growPageToFit(page, elements),
      pages,
    };
  }

  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.extractRawText({ arrayBuffer });
  const previewHtml = rawTextToPreviewHtml(result.value);
  const page = await extractDocxPage(arrayBuffer);
  const renderedElements = await extractEditableElementsSafely(arrayBuffer, page);
  const elements = renderedElements.length > 0 ? renderedElements : htmlPreviewToEditableElements(previewHtml);

  return {
    previewHtml,
    editable: elements.length > 0,
    elements,
    page: growPageToFit(page, elements),
    pages: page ? [page] : undefined,
    variables: extractVariableKeys(result.value),
  };
}

export async function extractDocumentPreviewFromDataUrl({
  dataUrl,
  fileName,
  fileType,
}: {
  dataUrl: string;
  fileName?: string;
  fileType?: string;
}) {
  const bytes = dataUrlToUint8Array(dataUrl);
  const file = new File([bytes], fileName || "documento.docx", {
    type: fileType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return extractDocumentPreview(file);
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
      pages?: ExtractedDocumentPage[];
      variables?: string[];
      editable?: boolean;
      elements?: TemplateElement[];
      converterOffline?: boolean;
    };

    return {
      previewHtml: preview.previewHtml,
      renderDataUrl: preview.renderDataUrl,
      renderFileType: preview.renderFileType,
      renderEngine: preview.renderEngine,
      imageDataUrl: preview.imageDataUrl,
      imageEngine: preview.imageEngine,
      page: preview.page,
      pages: preview.pages,
      editable: Boolean(preview.editable),
      elements: preview.elements ?? [],
      variables: preview.variables ?? extractVariableKeys(preview.previewHtml ?? ""),
      converterOffline: preview.converterOffline,
    };
  } catch (error) {
    console.warn("Preview DOCX via API indisponivel; usando fallback no navegador.", error);
    return null;
  }
}

export async function extractEditableDocxElementsFromDataUrl(
  dataUrl: string,
  page: ExtractedDocumentPage | undefined,
) {
  const bytes = dataUrlToUint8Array(dataUrl);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return extractEditableElementsSafely(arrayBuffer, page);
}

function isDocx(file: File) {
  return (
    file.type.includes("wordprocessingml") ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

async function extractEditableElementsSafely(
  arrayBuffer: ArrayBuffer,
  page: ExtractedDocumentPage | undefined,
) {
  try {
    return await renderDocxToEditableElements(arrayBuffer, page);
  } catch (error) {
    console.warn("Nao foi possivel converter o DOCX em elementos editaveis.", error);
    return [] as TemplateElement[];
  }
}

async function renderDocxToEditableElements(
  arrayBuffer: ArrayBuffer,
  page: ExtractedDocumentPage | undefined,
) {
  if (typeof document === "undefined") return [] as TemplateElement[];

  const { renderAsync } = await import("docx-preview");
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-20000px";
  host.style.top = "0";
  host.style.width = `${page?.width ?? 1123}px`;
  host.style.minHeight = `${page?.height ?? 794}px`;
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.appendChild(host);

  try {
    await renderAsync(arrayBuffer.slice(0), host, undefined, {
      className: "docx-editable",
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    });
    await waitForRenderedImages(host);
    await nextAnimationFrame();
    await nextAnimationFrame();
    return extractRenderedEditableElements(host, page);
  } finally {
    host.remove();
  }
}

function extractRenderedEditableElements(host: HTMLElement, page: ExtractedDocumentPage | undefined) {
  const elements: TemplateElement[] = [];
  const pageElements = Array.from(host.querySelectorAll<HTMLElement>("section.docx-editable"));
  const pages = pageElements.length ? pageElements : [host.querySelector<HTMLElement>("section") ?? host];

  pages.forEach((pageElement, pageIndex) => {
    const pageRect = pageElement.getBoundingClientRect();
    const pageWidth = Math.max(1, Math.round(page?.width ?? pageRect.width ?? 1123));

    for (const graphic of Array.from(pageElement.querySelectorAll<HTMLElement>("img"))) {
      const rect = relativeRect(graphic, pageRect);
      if (!rect || rect.width < 6 || rect.height < 6) continue;

      const content = graphic.getAttribute("src") || (graphic instanceof HTMLImageElement ? graphic.src : "");
      if (!content) continue;

      addImageElement(elements, content, rect, pageWidth, pageIndex);
    }

    for (const graphic of Array.from(pageElement.querySelectorAll<HTMLElement>("div,span"))) {
      if (graphic.textContent?.trim()) continue;
      const content = extractCssImageUrl(window.getComputedStyle(graphic).backgroundImage);
      if (!content) continue;

      const rect = relativeRect(graphic, pageRect);
      if (!rect || rect.width < 6 || rect.height < 6 || rect.width > 520 || rect.height > 320) continue;
      addImageElement(elements, content, rect, pageWidth, pageIndex);
    }

    for (const block of Array.from(pageElement.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6,td,th"))) {
      if ((block.tagName === "TD" || block.tagName === "TH") && block.querySelector("p,h1,h2,h3,h4,h5,h6")) {
        continue;
      }

      const text = normalizeText(block.textContent ?? "");
      if (!text) continue;

      const rect = relativeRect(block, pageRect);
      if (!rect || rect.width < 4 || rect.height < 4) continue;

      const styleElement = firstTextElement(block) ?? block;
      const blockStyle = window.getComputedStyle(block);
      const textStyle = window.getComputedStyle(styleElement);
      const fontSize = clamp(Math.round(parseCssPixels(textStyle.fontSize) || 14), 8, 72);
      const x = clamp(Math.round(rect.x), 0, Math.max(0, pageWidth - 8));
      const y = Math.max(0, Math.round(rect.y));
      const singleVariableKey = extractSingleVariableKey(text);

      elements.push({
        id: randomId("text"),
        type: singleVariableKey ? "variable" : "text",
        content: text,
        variableKey: singleVariableKey,
        variableLabel: singleVariableKey,
        variableRequired: true,
        x,
        y,
        pageIndex,
        width: clamp(Math.round(rect.width), 24, Math.max(24, pageWidth - x)),
        height: Math.max(Math.round(rect.height), Math.ceil(fontSize * 1.35)),
        fontSize,
        fontFamily: normalizeFontFamily(textStyle.fontFamily),
        color: cssColorToHex(textStyle.color),
        align: normalizeAlign(blockStyle.textAlign),
        bold: isBold(textStyle.fontWeight, block.tagName),
        italic: textStyle.fontStyle === "italic" || textStyle.fontStyle === "oblique",
        underline: textStyle.textDecorationLine.includes("underline"),
        lineHeight: normalizeLineHeight(textStyle.lineHeight, fontSize),
      });
    }
  });

  return elements.sort((a, b) => (a.pageIndex ?? 0) - (b.pageIndex ?? 0) || a.y - b.y || a.x - b.x);
}

function addImageElement(
  elements: TemplateElement[],
  content: string,
  rect: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageIndex = 0,
) {
  const x = clamp(Math.round(rect.x), 0, pageWidth);
  const y = Math.max(0, Math.round(rect.y));
  const width = clamp(Math.round(rect.width), 8, pageWidth);
  const height = Math.max(8, Math.round(rect.height));
  const duplicate = elements.some((element) =>
    element.type === "image" &&
    element.content === content &&
    Math.abs(element.x - x) <= 2 &&
    Math.abs(element.y - y) <= 2 &&
    Math.abs(element.width - width) <= 2 &&
    Math.abs(element.height - height) <= 2,
  );
  if (duplicate) return;

  elements.push({
    id: randomId("image"),
    type: "image",
    content,
    variableRequired: true,
    x,
    y,
    pageIndex,
    width,
    height,
    fontSize: 12,
    fontFamily: "Arial",
    color: "#111827",
    align: "center",
    bold: false,
    italic: false,
    underline: false,
    lineHeight: 1.15,
  });
}

function normalizeExtractedPages(
  pages: ExtractedDocumentPage[] | undefined,
  fallbackPage: ExtractedDocumentPage | undefined,
) {
  if (Array.isArray(pages) && pages.length > 0) {
    return pages.map((page, index) => ({ ...page, index: page.index ?? index }));
  }

  return fallbackPage ? [{ ...fallbackPage, index: fallbackPage.index ?? 0 }] : undefined;
}

function extractCssImageUrl(value: string) {
  const match = value.match(/^url\((.*)\)$/);
  if (!match) return "";
  return match[1].trim().replace(/^["']|["']$/g, "");
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
        italic: false,
        underline: false,
        lineHeight: 1.15,
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
      italic: false,
      underline: false,
      lineHeight: 1.15,
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

function growPageToFit(page: ExtractedDocumentPage | undefined, elements: TemplateElement[]) {
  if (!page) return undefined;
  const maxBottom = Math.max(0, ...elements.map((element) => element.y + element.height));
  if (maxBottom <= page.height) return page;
  return {
    ...page,
    height: Math.ceil(maxBottom + 24),
  };
}

function relativeRect(element: Element, pageRect: DOMRect) {
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;

  return {
    x: rect.left - pageRect.left,
    y: rect.top - pageRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function firstTextElement(element: Element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    if (node.textContent?.trim()) {
      return node.parentElement;
    }
    node = walker.nextNode();
  }

  return null;
}

function parseCssPixels(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFontFamily(value: string) {
  return value.split(",")[0]?.replaceAll('"', "").replaceAll("'", "").trim() || "Arial";
}

function normalizeAlign(value: string): "left" | "center" | "right" {
  if (value === "center") return "center";
  if (value === "right" || value === "end") return "right";
  return "left";
}

function isBold(value: string, tagName: string) {
  if (/^h[1-6]$/i.test(tagName)) return true;
  if (value === "bold" || value === "bolder") return true;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 600;
}

function normalizeLineHeight(value: string, fontSize: number) {
  const parsed = parseCssPixels(value);
  if (parsed > 0 && fontSize > 0) return clamp(Math.round((parsed / fontSize) * 100) / 100, 0.8, 2.4);
  return 1.15;
}

function cssColorToHex(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "#111827";
  return `#${toHex(Number(match[1]))}${toHex(Number(match[2]))}${toHex(Number(match[3]))}`;
}

function toHex(value: number) {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
}

function extractSingleVariableKey(text: string) {
  const keys = extractVariableKeys(text);
  return keys.length === 1 && /^\{\{\s*[^{}]+?\s*\}\}$/.test(text.trim()) ? keys[0] : undefined;
}

function randomId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function waitForRenderedImages(root: ParentNode) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return undefined;

      return new Promise<void>((resolve) => {
        const timeoutId = window.setTimeout(resolve, 2000);
        image.addEventListener("load", () => {
          window.clearTimeout(timeoutId);
          resolve();
        }, { once: true });
        image.addEventListener("error", () => {
          window.clearTimeout(timeoutId);
          resolve();
        }, { once: true });
      });
    }),
  );
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
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
