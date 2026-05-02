import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import mammoth from "mammoth";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractVariableKeys, type TemplatePageBorder } from "@/lib/certificate-layout";
import { convertDocxToPdfBuffer } from "@/lib/libreoffice";
import { convertDocxToPdfWithGotenberg } from "@/lib/gotenberg";

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
};

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export async function buildDocxPreview(buffer: Buffer): Promise<DocxPreviewResult> {
  const [rawText, page] = await Promise.all([
    extractRawText(buffer),
    extractDocxPage(buffer),
  ]);
  const gotenbergPdf = await convertDocxToPdfWithGotenberg(buffer);
  const libreOfficePdf = gotenbergPdf ? null : await convertDocxToPdfBuffer(buffer);
  const nativePdf = gotenbergPdf ?? libreOfficePdf;
  const fallbackImageDataUrl = nativePdf ? "" : await renderDocxPageImageSafely(buffer, page);
  const renderDataUrl = nativePdf
    ? `data:application/pdf;base64,${nativePdf.toString("base64")}`
    : fallbackImageDataUrl;
  const renderFileType = nativePdf ? "application/pdf" : fallbackImageDataUrl ? "image/png" : "";
  const renderEngine = gotenbergPdf ? "gotenberg" : libreOfficePdf ? "libreoffice" : fallbackImageDataUrl ? "docx-preview-api" : "";

  return {
    previewHtml: rawTextToPreviewHtml(rawText),
    renderDataUrl,
    renderFileType,
    renderEngine,
    imageDataUrl: fallbackImageDataUrl,
    imageEngine: fallbackImageDataUrl ? "docx-preview-api" : "",
    page,
    variables: extractVariableKeys(rawText),
  };
}

async function renderDocxPageImageSafely(buffer: Buffer, page: DocxPreviewPage) {
  try {
    return await renderDocxPageImage(buffer, page);
  } catch (error) {
    console.warn("Preview visual DOCX indisponivel; usando preview no navegador.", error);
    return "";
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

async function renderDocxPageImage(buffer: Buffer, page: DocxPreviewPage) {
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

    const screenshot = await tab.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: page.width,
        height: page.height,
      },
    });
    return `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;
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
