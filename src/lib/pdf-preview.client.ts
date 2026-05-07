"use client";

import type { TemplateLayoutPage } from "@/lib/certificate-layout";

const PDF_POINTS_TO_CSS_PIXELS = 4 / 3;

export function isPdfDataUrl(value: string | null | undefined) {
  return /^data:application\/pdf(?:[;,]|$)/i.test(value ?? "");
}

export async function renderPdfPagesFromDataUrl(dataUrl: string): Promise<TemplateLayoutPage[]> {
  if (!isPdfDataUrl(dataUrl)) return [];
  if (typeof document === "undefined") return [];

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: dataUrlToUint8Array(dataUrl) });
  const pdf = await loadingTask.promise;

  try {
    const pages: TemplateLayoutPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_POINTS_TO_CSS_PIXELS });
      const canvas = document.createElement("canvas");

      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));

      await page.render({ canvas, viewport }).promise;

      pages.push({
        index: pageNumber - 1,
        width: canvas.width,
        height: canvas.height,
        orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
        imageDataUrl: canvas.toDataURL("image/png"),
      });

      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }

    return pages;
  } finally {
    await pdf.destroy();
  }
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
