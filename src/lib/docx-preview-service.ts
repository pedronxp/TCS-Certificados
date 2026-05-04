import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import mammoth from "mammoth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractVariableKeys, type TemplateElement, type TemplatePageBorder } from "@/lib/certificate-layout";
import { convertDocxToPdfWithCloudConvert } from "@/lib/cloudconvert";
import { convertDocxToPdfBuffer } from "@/lib/libreoffice";
import { convertDocxToPdfWithGotenberg } from "@/lib/gotenberg";
import { convertDocxToPdfWithMicrosoftGraph } from "@/lib/microsoft-graph";

export type DocxPreviewPage = {
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  border?: TemplatePageBorder;
};

export type DocxPreviewResult = {
  previewHtml: string;
  renderDataUrl: string;
  renderFileType: string;
  renderEngine: string;
  imageDataUrl: string;
  imageEngine: string;
  page: DocxPreviewPage;
  variables: string[];
  editable: boolean;
  elements: TemplateElement[];
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function buildDocxPreview(buffer: Buffer): Promise<DocxPreviewResult> {
  const [rawText, page] = await Promise.all([
    extractRawText(buffer),
    extractDocxPage(buffer),
  ]);
  const microsoftGraphPdf = await convertDocxToPdfWithMicrosoftGraph(buffer);
  const cloudConvertPdf = microsoftGraphPdf ? null : await convertDocxToPdfWithCloudConvert(buffer);
  const gotenbergPdf = microsoftGraphPdf || cloudConvertPdf ? null : await convertDocxToPdfWithGotenberg(buffer);
  const libreOfficePdf = microsoftGraphPdf || cloudConvertPdf || gotenbergPdf
    ? null
    : await convertDocxToPdfBuffer(buffer);
  const nativePdf = microsoftGraphPdf ?? cloudConvertPdf ?? gotenbergPdf ?? libreOfficePdf;
  const editablePreview = nativePdf ? { imageDataUrl: "", elements: [] as TemplateElement[] } : await renderDocxPagePreviewSafely(buffer, page);
  const fallbackImageDataUrl = nativePdf ? "" : editablePreview.imageDataUrl;
  const renderDataUrl = nativePdf
    ? `data:application/pdf;base64,${nativePdf.toString("base64")}`
    : fallbackImageDataUrl;
  const renderFileType = nativePdf ? "application/pdf" : fallbackImageDataUrl ? "image/png" : "";
  const renderEngine = microsoftGraphPdf
    ? "microsoft-graph"
    : cloudConvertPdf
      ? "cloudconvert"
      : gotenbergPdf
        ? "gotenberg"
        : libreOfficePdf
          ? "libreoffice"
          : fallbackImageDataUrl
            ? "docx-preview-api"
            : "";

  return {
    previewHtml: rawTextToPreviewHtml(rawText),
    renderDataUrl,
    renderFileType,
    renderEngine,
    imageDataUrl: fallbackImageDataUrl,
    imageEngine: fallbackImageDataUrl ? "docx-preview-api" : "",
    page,
    variables: extractVariableKeys(rawText),
    editable: !nativePdf && editablePreview.elements.length > 0,
    elements: editablePreview.elements,
  };
}

async function renderDocxPagePreviewSafely(buffer: Buffer, page: DocxPreviewPage) {
  try {
    return await renderDocxPagePreview(buffer, page);
  } catch (error) {
    console.warn("Preview visual DOCX indisponivel; usando preview no navegador.", error);
    return { imageDataUrl: "", elements: [] as TemplateElement[] };
  }
}

async function extractRawText(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractDocxPage(buffer: Buffer): Promise<DocxPreviewPage> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) return defaultPage();

  const document = new DOMParser().parseFromString(documentXml, "application/xml");
  const sectionProperties = lastElement(document.getElementsByTagName("w:sectPr"));
  const pageSize = firstElement(sectionProperties?.getElementsByTagName("w:pgSz"));
  const widthTwips = readWordNumber(pageSize, "w");
  const heightTwips = readWordNumber(pageSize, "h");
  if (!widthTwips || !heightTwips) return defaultPage();

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
    border: sectionProperties ? readPageBorder(sectionProperties) : undefined,
  };
}

function defaultPage(): DocxPreviewPage {
  return {
    width: 1123,
    height: 794,
    orientation: "landscape",
  };
}

function readPageBorder(sectionProperties: Element): TemplatePageBorder | undefined {
  const pageBorders = firstElement(sectionProperties.getElementsByTagName("w:pgBorders"));
  const border = firstElement(pageBorders?.getElementsByTagName("w:top"));
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

async function renderDocxPagePreview(buffer: Buffer, page: DocxPreviewPage) {
  const html = await docxPreviewHtml(buffer, page);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const tab = await browser.newPage({
      viewport: {
        width: page.width,
        height: page.height,
      },
      deviceScaleFactor: 1,
    });
    await tab.setContent(html, { waitUntil: "domcontentloaded" });
    await tab.waitForFunction(
      () => document.body.dataset.renderReady === "true" || Boolean(document.body.dataset.renderError),
      undefined,
      { timeout: 20000 },
    );

    const renderError = await tab.evaluate(() => document.body.dataset.renderError ?? "");
    if (renderError) throw new Error(renderError);

    const elements = await tab.evaluate(extractEditableElementsFromRenderedDocx, page.width);
    const screenshot = await tab.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height,
      },
    });
    return {
      imageDataUrl: `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`,
      elements,
    };
  } finally {
    await browser.close();
  }
}

async function docxPreviewHtml(buffer: Buffer, page: DocxPreviewPage) {
  const [jszipScript, docxPreviewScript] = await Promise.all([
    readFile(path.join(process.cwd(), "node_modules", "jszip", "dist", "jszip.min.js"), "utf8"),
    readFile(path.join(process.cwd(), "node_modules", "docx-preview", "dist", "docx-preview.min.js"), "utf8"),
  ]);
  const border = page.border
    ? `<div style="position:absolute;inset:${page.border.inset}px;border:${page.border.width}px solid ${page.border.color};pointer-events:none;z-index:2;"></div>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8" /><style>*{box-sizing:border-box}body{margin:0;background:#fff;width:${page.width}px;height:${page.height}px;overflow:hidden}.page{position:relative;width:${page.width}px;height:${page.height}px;overflow:hidden;background:#fff}.docx-root{position:absolute;inset:0;overflow:hidden;background:#fff;z-index:1}.docx-root .docx-render-wrapper{align-items:flex-start!important;background:transparent!important;padding:0!important}.docx-root section.docx-render{background:#fff!important;box-shadow:none!important;margin:0!important;width:${page.width}px!important;min-height:${page.height}px!important}.docx-root section.docx-render:not(:first-of-type){display:none!important}</style><script>${safeScript(jszipScript)}</script><script>${safeScript(docxPreviewScript)}</script></head><body><main class="page"><div id="docx-root" class="docx-root"></div>${border}</main><script>${safeScript(`
    (async function () {
      try {
        var binary = atob("${buffer.toString("base64")}");
        var bytes = new Uint8Array(binary.length);
        for (var index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        await docx.renderAsync(bytes, document.getElementById("docx-root"), undefined, {
          className: "docx-render",
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
          renderEndnotes: true
        });
        document.body.dataset.renderReady = "true";
      } catch (error) {
        document.body.dataset.renderError = error && error.message ? error.message : String(error);
      }
    })();
  `)}</script></body></html>`;
}

function extractEditableElementsFromRenderedDocx(pageWidth: number): TemplateElement[] {
  const pageElement =
    document.querySelector<HTMLElement>("section.docx-render") ??
    document.querySelector<HTMLElement>("section") ??
    document.body;
  const pageRect = pageElement.getBoundingClientRect();
  const elements: TemplateElement[] = [];

  for (const image of Array.from(pageElement.querySelectorAll<HTMLImageElement>("img"))) {
    const rect = relativeRect(image, pageRect);
    if (!rect || rect.width < 6 || rect.height < 6) continue;
    const content = image.getAttribute("src") || image.src;
    if (!content) continue;
    addImageElement(elements, content, rect, pageWidth);
  }

  for (const block of Array.from(pageElement.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6,td,th"))) {
    if ((block.tagName === "TD" || block.tagName === "TH") && block.querySelector("p,h1,h2,h3,h4,h5,h6")) {
      continue;
    }

    const text = normalizeRenderedText(block.textContent ?? "");
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

  return elements.sort((a, b) => a.y - b.y || a.x - b.x);

  function addImageElement(
    target: TemplateElement[],
    content: string,
    rect: { x: number; y: number; width: number; height: number },
    widthLimit: number,
  ) {
    const x = clamp(Math.round(rect.x), 0, widthLimit);
    const y = Math.max(0, Math.round(rect.y));
    const width = clamp(Math.round(rect.width), 8, widthLimit);
    const height = Math.max(8, Math.round(rect.height));

    target.push({
      id: randomId("image"),
      type: "image",
      content,
      variableRequired: true,
      x,
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
  }

  function relativeRect(element: Element, rootRect: DOMRect) {
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    return {
      x: rect.left - rootRect.left,
      y: rect.top - rootRect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function firstTextElement(element: Element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      if (node.textContent?.trim()) return node.parentElement;
      node = walker.nextNode();
    }

    return null;
  }

  function normalizeRenderedText(value: string) {
    return value
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
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
    const match = text.trim().match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
    if (!match) return undefined;
    return match[1]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_ ]/g, "")
      .trim()
      .replace(/\s+/g, "_");
  }

  function randomId(prefix: string) {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Math.random().toString(36).slice(2)}`;
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }
}

function rawTextToPreviewHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => normalizeText(paragraph))
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readWordNumber(element: Element | undefined, key: string) {
  const value = readWordAttribute(element, key);
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readWordAttribute(element: Element | undefined, key: string) {
  return element?.getAttributeNS(WORD_NS, key) ?? element?.getAttribute(`w:${key}`) ?? element?.getAttribute(key);
}

function firstElement(list: HTMLCollectionOf<Element> | undefined) {
  return list && list.length > 0 ? list[0] : undefined;
}

function lastElement(list: HTMLCollectionOf<Element>) {
  return list.length > 0 ? list[list.length - 1] : undefined;
}

function safeScript(value: string) {
  return value.replaceAll("</script", "<\\/script");
}
