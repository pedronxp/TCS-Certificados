import type { TemplateElement } from "@/lib/certificate-layout";

export async function extractDocumentPreview(file: File) {
  if (!isDocx(file)) {
    return {
      previewHtml: undefined,
      elements: [] as TemplateElement[],
    };
  }

  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const previewHtml = result.value;

  return {
    previewHtml,
    elements: [] as TemplateElement[],
  };
}

function isDocx(file: File) {
  return (
    file.type.includes("wordprocessingml") ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

export function dataUrlToHtmlDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111827;line-height:1.5}p{margin:0 0 12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px}h1,h2,h3{margin:0 0 12px}</style></head><body>${html}</body></html>`;
}
