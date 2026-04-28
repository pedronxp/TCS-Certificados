import { labelFromKey, normalizeVariableKey, type TemplateElement } from "@/lib/certificate-layout";

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
  const placeholders = extractPlaceholders(previewHtml);

  return {
    previewHtml,
    elements: placeholders.map((key, index) => placeholderElement(key, index)),
  };
}

function isDocx(file: File) {
  return (
    file.type.includes("wordprocessingml") ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

function extractPlaceholders(html: string) {
  const matches = html.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g);
  const keys = new Set<string>();
  for (const match of matches) {
    const key = normalizeVariableKey(match[1]);
    if (key) keys.add(key);
  }
  return [...keys];
}

function placeholderElement(key: string, index: number): TemplateElement {
  return {
    id: `variable-${key}-${crypto.randomUUID()}`,
    type: "variable",
    content: `{{${key}}}`,
    variableKey: key,
    variableLabel: labelFromKey(key),
    variableRequired: true,
    x: 120,
    y: 120 + index * 72,
    width: 360,
    height: 56,
    fontSize: 28,
    fontFamily: "Arial",
    color: "#111827",
    align: "left",
    bold: false,
  };
}

export function dataUrlToHtmlDocument(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111827;line-height:1.5}p{margin:0 0 12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px}h1,h2,h3{margin:0 0 12px}</style></head><body>${html}</body></html>`;
}
