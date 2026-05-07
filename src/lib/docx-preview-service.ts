import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import mammoth from "mammoth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractVariableKeys, type TemplateBaseAsset, type TemplateElement, type TemplatePageBorder } from "@/lib/certificate-layout";
import { convertDocxToPdfWithGotenberg } from "@/lib/gotenberg";
import { convertDocxToPdfBuffer } from "@/lib/libreoffice";

/**
 * DocxPreviewService — Serviço de preview DOCX para o editor
 *
 * Cadeia de conversão (prioridade):
 * 1. Gotenberg (motor primário — Open Source, hospedado gratuitamente)
 * 2. LibreOffice local (fallback em dev, quando disponível)
 * 3. docx-preview.js via Playwright (fallback visual se nenhum PDF disponível)
 *
 * Nota: CloudConvert e Microsoft Graph foram removidos em favor
 * de uma stack 100% Open Source.
 */

export type DocxPreviewPage = {
  index?: number;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  imageDataUrl?: string;
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
  pages: DocxPreviewPage[];
  variables: string[];
  editable: boolean;
  elements: TemplateElement[];
  assets: TemplateBaseAsset[];
  /** Indica se o serviço de conversão está offline */
  converterOffline?: boolean;
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const PDF_POINTS_TO_CSS_PIXELS = 4 / 3;

export async function buildDocxPreview(
  buffer: Buffer,
  options: { assets?: TemplateBaseAsset[] } = {},
): Promise<DocxPreviewResult> {
  const workingBuffer = await applyDocxAssetReplacements(buffer, options.assets);
  const [rawText, page] = await Promise.all([
    extractRawText(workingBuffer),
    extractDocxPage(workingBuffer),
  ]);

  // ── Motor primário: Gotenberg (Open Source) ──
  const gotenbergPdf = await convertDocxToPdfWithGotenberg(workingBuffer);

  // ── Fallback dev: LibreOffice local ──
  const libreOfficePdf = gotenbergPdf ? null : await convertDocxToPdfBuffer(workingBuffer);

  const nativePdf = gotenbergPdf ?? libreOfficePdf;
  const assets = mergeAssetReplacements(
    await extractDocxMediaAssets(buffer),
    options.assets,
  );

  // ── Fallback visual: docx-preview.js via Playwright ──
  const editablePreview = await renderDocxPagePreviewSafely(workingBuffer, page);
  const fallbackImageDataUrl = editablePreview.imageDataUrl;

  const pdfPages = nativePdf
    ? mergePdfPagesWithFallbackImages(await extractPdfPages(nativePdf, page), editablePreview.pages)
    : [];
  const renderedPages: DocxPreviewPage[] = !nativePdf && editablePreview.pages.length
    ? editablePreview.pages
    : nativePdf
      ? pdfPages
      : [{ ...page, index: 0, imageDataUrl: fallbackImageDataUrl || undefined }];
  const normalizedPages = normalizeEditablePreviewPages(renderedPages, page, editablePreview.elements);
  const pages = nativePdf ? normalizedPages : trimTrailingEditablePages(normalizedPages, []);

  const renderDataUrl = nativePdf
    ? `data:application/pdf;base64,${nativePdf.toString("base64")}`
    : fallbackImageDataUrl;
  const renderFileType = nativePdf ? "application/pdf" : fallbackImageDataUrl ? "image/png" : "";
  const renderEngine = gotenbergPdf
    ? "gotenberg"
    : libreOfficePdf
      ? "libreoffice"
      : fallbackImageDataUrl
        ? "docx-preview-api"
        : "";

  // Se nenhum motor conseguiu converter, sinaliza para o frontend
  const converterOffline = !nativePdf && !fallbackImageDataUrl;

  return {
    previewHtml: rawTextToPreviewHtml(rawText),
    renderDataUrl,
    renderFileType,
    renderEngine,
    imageDataUrl: fallbackImageDataUrl,
    imageEngine: fallbackImageDataUrl ? "docx-preview-api" : "",
    page,
    pages,
    variables: extractVariableKeys(rawText),
    editable: false,
    elements: [],
    assets,
    converterOffline,
  };
}

export async function applyDocxAssetReplacements(
  buffer: Buffer,
  assets: TemplateBaseAsset[] | undefined,
) {
  const replacements = (assets ?? []).filter((asset) => asset.path && asset.replacementDataUrl);
  if (replacements.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);

  for (const asset of replacements) {
    if (!asset.replacementDataUrl || !zip.file(asset.path)) continue;
    zip.file(asset.path, dataUrlToBuffer(asset.replacementDataUrl));
  }

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function renderDocxPagePreviewSafely(buffer: Buffer, page: DocxPreviewPage) {
  try {
    return await renderDocxPagePreview(buffer, page);
  } catch (error) {
    console.warn("Preview visual DOCX indisponivel; usando preview no navegador.", error);
    return { imageDataUrl: "", pages: [{ ...page, index: 0 }], elements: [] as TemplateElement[] };
  }
}

function normalizeEditablePreviewPages(
  pages: DocxPreviewPage[],
  fallbackPage: DocxPreviewPage,
  elements: TemplateElement[],
) {
  if (pages.length !== 1 || elements.length === 0) return pages;

  const [singlePage] = pages;
  const fallbackHeight = Math.max(1, fallbackPage.height);
  const maxElementBottom = elements.reduce(
    (max, element) => Math.max(max, element.y + element.height),
    singlePage.height,
  );

  if (maxElementBottom <= fallbackHeight * 1.1) return pages;

  const pageCount = Math.max(1, Math.ceil(maxElementBottom / fallbackHeight));

  return Array.from({ length: pageCount }, (_, index) => ({
    ...fallbackPage,
    index,
    border: fallbackPage.border ?? singlePage.border,
    imageDataUrl: undefined,
  }));
}

function trimTrailingEditablePages(
  pages: DocxPreviewPage[],
  elements: TemplateElement[],
) {
  if (pages.length <= 1 || elements.length === 0) return pages;

  const maxPageIndex = Math.max(0, ...elements.map((element) => element.pageIndex ?? 0));
  return pages.filter((page, index) => (page.index ?? index) <= maxPageIndex);
}

function mergePdfPagesWithFallbackImages(
  pdfPages: DocxPreviewPage[],
  fallbackPages: DocxPreviewPage[],
) {
  return pdfPages.map((page, index) => ({
    ...page,
    imageDataUrl: fallbackPages[index]?.imageDataUrl,
  }));
}

async function extractDocxMediaAssets(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const mediaFiles = Object.keys(zip.files).filter((name) => /^word\/media\/[^/]+\.(png|jpe?g)$/i.test(name));
  const images: TemplateBaseAsset[] = [];

  for (const fileName of mediaFiles) {
    const file = zip.file(fileName);
    if (!file) continue;

    const imageBuffer = await file.async("nodebuffer");
    const size = readImageSize(imageBuffer);
    if (!size) continue;

    const contentType = imageMimeType(fileName);
    images.push({
      path: fileName,
      name: fileName.split("/").at(-1) ?? fileName,
      contentType,
      dataUrl: `data:${contentType};base64,${imageBuffer.toString("base64")}`,
      ...size,
    });
  }

  return images;
}

function mergeAssetReplacements(
  assets: TemplateBaseAsset[],
  replacements: TemplateBaseAsset[] | undefined,
) {
  if (!replacements?.length) return assets;
  const replacementMap = new Map(replacements.map((asset) => [asset.path, asset.replacementDataUrl]));

  return assets.map((asset) => ({
    ...asset,
    replacementDataUrl: replacementMap.get(asset.path) || asset.replacementDataUrl,
  }));
}

function readImageSize(buffer: Buffer) {
  const pngSize = readPngSize(buffer);
  if (pngSize) return pngSize;
  return readJpegSize(buffer);
}

function readPngSize(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegSize(buffer: Buffer) {
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);

    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function imageMimeType(fileName: string) {
  return fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

function dataUrlToBuffer(dataUrl: string) {
  return Buffer.from(dataUrl.split(",").at(-1) ?? "", "base64");
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

    const screenshotBounds = await tab.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;

      return {
        width: Math.ceil(Math.max(root.scrollWidth, body.scrollWidth, root.clientWidth, body.clientWidth)),
        height: Math.ceil(Math.max(root.scrollHeight, body.scrollHeight, root.clientHeight, body.clientHeight)),
      };
    });
    await tab.setViewportSize({
      width: Math.min(16384, Math.max(page.width, screenshotBounds.width)),
      height: Math.min(16384, Math.max(page.height, screenshotBounds.height)),
    });

    const renderedPages = await tab.evaluate(extractRenderedDocxPages, page);
    const elements = await tab.evaluate(extractEditableElementsFromRenderedDocx, page.width);
    const pages: DocxPreviewPage[] = [];

    for (const renderedPage of renderedPages) {
      if (renderedPages.length === 1 && renderedPage.height > page.height * 1.2) {
        const pageCount = Math.max(1, Math.ceil(renderedPage.height / page.height));

        for (let index = 0; index < pageCount; index += 1) {
          const clipY = renderedPage.y + index * page.height;
          const remainingHeight = Math.max(1, renderedPage.y + renderedPage.height - clipY);
          const clipHeight = Math.min(page.height, remainingHeight);
          const clip = clampScreenshotClip({
            x: renderedPage.x,
            y: clipY,
            width: renderedPage.width,
            height: clipHeight,
          }, screenshotBounds);
          if (!clip) continue;

          const screenshot = await tab.screenshot({
            type: "png",
            clip,
          });

          pages.push({
            index,
            width: renderedPage.width,
            height: page.height,
            orientation: renderedPage.width >= page.height ? "landscape" : "portrait",
            border: renderedPage.border,
            imageDataUrl: `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`,
          });
        }

        continue;
      }

      const clip = clampScreenshotClip(renderedPage, screenshotBounds);
      if (!clip) continue;

      const screenshot = await tab.screenshot({
        type: "png",
        clip,
      });

      pages.push({
        index: renderedPage.index,
        width: renderedPage.width,
        height: renderedPage.height,
        orientation: renderedPage.orientation === "portrait" ? "portrait" : "landscape",
        border: renderedPage.border,
        imageDataUrl: `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`,
      });
    }

    return {
      imageDataUrl: pages[0]?.imageDataUrl ?? "",
      pages,
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

  return `<!doctype html><html><head><meta charset="utf-8" /><style>*{box-sizing:border-box}body{margin:0;background:#fff;width:${page.width}px;min-height:${page.height}px;overflow:visible}.page{position:relative;width:${page.width}px;min-height:${page.height}px;background:#fff}.docx-root{position:relative;background:#fff;z-index:1}.docx-root .docx-render-wrapper{align-items:flex-start!important;background:transparent!important;padding:0!important}.docx-root section.docx-render{position:relative;background:#fff!important;box-shadow:none!important;margin:0 0 24px 0!important;width:${page.width}px!important;min-height:${page.height}px!important;overflow:hidden!important}.docx-root section.docx-render:last-of-type{margin-bottom:0!important}</style><script>${safeScript(jszipScript)}</script><script>${safeScript(docxPreviewScript)}</script></head><body><main class="page"><div id="docx-root" class="docx-root"></div>${border}</main><script>${safeScript(`
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

function extractRenderedDocxPages(fallbackPage: DocxPreviewPage) {
  const pageElements = Array.from(document.querySelectorAll<HTMLElement>("section.docx-render"));
  const pages = pageElements.length ? pageElements : [document.body];

  return pages.map((pageElement, index) => {
    const rect = pageElement.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || fallbackPage.width));
    const height = Math.max(1, Math.round(rect.height || fallbackPage.height));

    return {
      index,
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width,
      height,
      orientation: width >= height ? "landscape" : "portrait",
      border: fallbackPage.border,
    };
  });
}

function clampScreenshotClip(
  rect: { x: number; y: number; width: number; height: number },
  bounds: { width: number; height: number },
) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const maxWidth = Math.max(0, bounds.width - x);
  const maxHeight = Math.max(0, bounds.height - y);
  const width = Math.min(Math.max(1, Math.ceil(rect.width)), maxWidth);
  const height = Math.min(Math.max(1, Math.ceil(rect.height)), maxHeight);

  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}

function extractEditableElementsFromRenderedDocx(pageWidth: number): TemplateElement[] {
  const elements: TemplateElement[] = [];
  const pageElements = Array.from(document.querySelectorAll<HTMLElement>("section.docx-render"));
  const pages = pageElements.length ? pageElements : [document.querySelector<HTMLElement>("section") ?? document.body];

  pages.forEach((pageElement, pageIndex) => {
    const pageRect = pageElement.getBoundingClientRect();
    const currentPageWidth = Math.max(1, Math.round(pageRect.width || pageWidth));

    for (const image of Array.from(pageElement.querySelectorAll<HTMLImageElement>("img"))) {
      const rect = relativeRect(image, pageRect);
      if (!rect || rect.width < 6 || rect.height < 6) continue;
      const content = image.getAttribute("src") || image.src;
      if (!content) continue;
      addImageElement(elements, content, rect, currentPageWidth, pageIndex);
    }

    for (const graphic of Array.from(pageElement.querySelectorAll<HTMLElement>("div,span"))) {
      if (graphic.textContent?.trim()) continue;
      const content = extractCssImageUrl(window.getComputedStyle(graphic).backgroundImage);
      if (!content) continue;

      const rect = relativeRect(graphic, pageRect);
      if (!rect || rect.width < 6 || rect.height < 6) continue;
      addImageElement(elements, content, rect, currentPageWidth, pageIndex);
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
      const x = clamp(Math.round(rect.x), 0, Math.max(0, currentPageWidth - 8));
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
        width: clamp(Math.round(rect.width), 24, Math.max(24, currentPageWidth - x)),
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

  function addImageElement(
    target: TemplateElement[],
    content: string,
    rect: { x: number; y: number; width: number; height: number },
    widthLimit: number,
    pageIndex: number,
  ) {
    const x = clamp(Math.round(rect.x), 0, widthLimit);
    const y = Math.max(0, Math.round(rect.y));
    const width = clamp(Math.round(rect.width), 8, widthLimit);
    const height = Math.max(8, Math.round(rect.height));
    const prefix = isWatermarkRect(rect, widthLimit) ? "watermark" : "image";

    target.push({
      id: randomId(prefix),
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

  function isWatermarkRect(
    rect: { width: number; height: number },
    widthLimit: number,
  ) {
    return rect.width >= widthLimit * 0.45 || rect.height >= 260;
  }

  function extractCssImageUrl(value: string) {
    if (!value || value === "none") return "";
    const match = value.match(/url\((['"]?)(.*?)\1\)/i);
    return match?.[2] ?? "";
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

async function extractPdfPages(pdfBuffer: Buffer, fallbackPage: DocxPreviewPage): Promise<DocxPreviewPage[]> {
  try {
    const document = await PDFDocument.load(pdfBuffer);
    return document.getPages().map((page, index) => {
      const size = page.getSize();
      const width = pdfPointsToCssPixels(size.width);
      const height = pdfPointsToCssPixels(size.height);

      return {
        index,
        width,
        height,
        orientation: width >= height ? "landscape" as const : "portrait" as const,
        border: fallbackPage.border,
      };
    });
  } catch {
    return [{ ...fallbackPage, index: 0 }];
  }
}

function pdfPointsToCssPixels(value: number) {
  return Math.max(1, Math.round(value * PDF_POINTS_TO_CSS_PIXELS));
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
