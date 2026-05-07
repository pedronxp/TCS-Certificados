import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { extractVariableKeys, normalizeVariableKey, type TemplateElement } from "@/lib/certificate-layout";
import { convertOfficeToPdfWithGotenberg } from "@/lib/gotenberg";
import { convertOfficeToPdfBuffer } from "@/lib/libreoffice";
import type { DocxPreviewPage, DocxPreviewResult } from "@/lib/docx-preview-service";

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const EMU_PER_CSS_PIXEL = 9525;

export async function buildPptxPreview(buffer: Buffer): Promise<DocxPreviewResult> {
  const [rawText, page] = await Promise.all([
    extractPptxText(buffer),
    extractPptxPage(buffer),
  ]);

  const gotenbergPdf = await convertOfficeToPdfWithGotenberg({
    buffer,
    fileName: "certificate.pptx",
    mimeType: PPTX_MIME_TYPE,
  });
  const libreOfficePdf = gotenbergPdf ? null : await convertOfficeToPdfBuffer(buffer, "pptx");
  const nativePdf = gotenbergPdf ?? libreOfficePdf;
  const pdfPages = nativePdf ? await extractPdfPages(nativePdf, page) : [];
  const pages = pdfPages.length ? pdfPages : [{ ...page, index: 0 }];

  return {
    previewHtml: rawTextToPreviewHtml(rawText),
    renderDataUrl: nativePdf ? `data:application/pdf;base64,${nativePdf.toString("base64")}` : "",
    renderFileType: nativePdf ? "application/pdf" : "",
    renderEngine: gotenbergPdf ? "gotenberg" : libreOfficePdf ? "libreoffice" : "",
    imageDataUrl: "",
    imageEngine: "",
    page: pages[0] ?? page,
    pages,
    variables: extractPptxVariableKeys(rawText),
    editable: false,
    elements: [] as TemplateElement[],
    assets: [],
    converterOffline: !nativePdf,
  };
}

export async function extractPptxText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(compareSlideNames);
  const slides: string[] = [];

  for (const name of slideNames) {
    const xml = await zip.file(name)?.async("text");
    const text = xml ? extractTextNodes(xml) : "";
    if (text) slides.push(text);
  }

  return slides.join("\n\n");
}

export function extractPptxVariableKeys(text: string) {
  const keys = new Set(extractVariableKeys(text));

  for (const match of text.matchAll(/(^|[^{])\{\s*([A-Za-z0-9_\u00c0-\u017f ]+?)\s*\}([^}]|$)/g)) {
    const key = normalizeVariableKey(match[2] ?? "");
    if (key) keys.add(key);
  }

  return [...keys];
}

async function extractPptxPage(buffer: Buffer): Promise<DocxPreviewPage> {
  const zip = await JSZip.loadAsync(buffer);
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("text");
  if (!presentationXml) return defaultPage();

  const document = new DOMParser().parseFromString(presentationXml, "application/xml");
  const slideSize = firstElement(document.getElementsByTagName("p:sldSz"));
  const widthEmu = readNumberAttribute(slideSize, "cx");
  const heightEmu = readNumberAttribute(slideSize, "cy");
  if (!widthEmu || !heightEmu) return defaultPage();

  const width = Math.max(1, Math.round(widthEmu / EMU_PER_CSS_PIXEL));
  const height = Math.max(1, Math.round(heightEmu / EMU_PER_CSS_PIXEL));

  return {
    width,
    height,
    orientation: width >= height ? "landscape" : "portrait",
  };
}

async function extractPdfPages(pdfBuffer: Buffer, fallbackPage: DocxPreviewPage): Promise<DocxPreviewPage[]> {
  try {
    const document = await PDFDocument.load(pdfBuffer);
    return document.getPages().map((page, index) => {
      const size = page.getSize();
      const width = Math.max(1, Math.round(size.width * 4 / 3));
      const height = Math.max(1, Math.round(size.height * 4 / 3));

      return {
        index,
        width,
        height,
        orientation: width >= height ? "landscape" as const : "portrait" as const,
      };
    });
  } catch {
    return [{ ...fallbackPage, index: 0 }];
  }
}

function extractTextNodes(xml: string) {
  const parts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXmlText(match[1] ?? "").trim())
    .filter(Boolean);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function rawTextToPreviewHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

function decodeXmlText(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function compareSlideNames(left: string, right: string) {
  return slideNumber(left) - slideNumber(right);
}

function slideNumber(value: string) {
  return Number(value.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
}

function defaultPage(): DocxPreviewPage {
  return {
    width: 1280,
    height: 720,
    orientation: "landscape",
  };
}

function readNumberAttribute(element: Element | undefined, key: string) {
  const value = element?.getAttribute(key);
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function firstElement(list: HTMLCollectionOf<Element> | undefined) {
  return list && list.length > 0 ? list[0] : undefined;
}
