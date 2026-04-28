import { z } from "zod";

export const templateElementSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "variable", "image", "qr"]),
  content: z.string().default(""),
  variableKey: z.string().optional(),
  variableLabel: z.string().optional(),
  variableRequired: z.boolean().default(true),
  x: z.number().default(80),
  y: z.number().default(80),
  width: z.number().default(260),
  height: z.number().default(56),
  fontSize: z.number().default(28),
  fontFamily: z.string().default("Arial"),
  color: z.string().default("#111827"),
  align: z.enum(["left", "center", "right"]).default("center"),
  bold: z.boolean().default(false),
});

export const templateLayoutSchema = z.object({
  elements: z.array(templateElementSchema).default([]),
  baseFileName: z.string().optional(),
  baseFileType: z.string().optional(),
  baseFileDataUrl: z.string().optional(),
  basePreviewHtml: z.string().optional(),
});

export type TemplateElement = z.infer<typeof templateElementSchema>;
export type TemplateLayout = z.infer<typeof templateLayoutSchema>;

export function extractVariables(layout: TemplateLayout) {
  const variables = new Map<string, { label: string; required: boolean }>();

  for (const element of layout.elements) {
    const rawMatches = element.content.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
    for (const match of rawMatches) {
      variables.set(match[1], {
        label: labelFromKey(match[1]),
        required: true,
      });
    }

    if (element.type === "variable" && element.variableKey) {
      variables.set(element.variableKey, {
        label: element.variableLabel?.trim() || labelFromKey(element.variableKey),
        required: element.variableRequired,
      });
    }
  }

  return [...variables.entries()].map(([key, variable]) => ({
    key,
    label: variable.label,
    required: variable.required,
  }));
}

export function labelFromKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeVariableKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

export function fillTemplateText(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

export function defaultLayout(): TemplateLayout {
  return {
    elements: [
      {
        id: "title",
        type: "text",
        content: "Certificado",
        variableRequired: true,
        x: 250,
        y: 90,
        width: 620,
        height: 70,
        fontSize: 54,
        fontFamily: "Georgia",
        color: "#0f172a",
        align: "center",
        bold: true,
      },
      {
        id: "recipient",
        type: "variable",
        content: "{{nome}}",
        variableKey: "nome",
        variableLabel: "Nome do participante",
        variableRequired: true,
        x: 190,
        y: 300,
        width: 740,
        height: 72,
        fontSize: 44,
        fontFamily: "Georgia",
        color: "#111827",
        align: "center",
        bold: true,
      },
      {
        id: "body",
        type: "text",
        content: "Concluiu o curso {{curso}} em {{data}}.",
        variableRequired: true,
        x: 230,
        y: 410,
        width: 660,
        height: 52,
        fontSize: 26,
        fontFamily: "Arial",
        color: "#374151",
        align: "center",
        bold: false,
      },
      {
        id: "qr",
        type: "qr",
        content: "",
        variableRequired: true,
        x: 955,
        y: 630,
        width: 105,
        height: 105,
        fontSize: 12,
        fontFamily: "Arial",
        color: "#111827",
        align: "center",
        bold: false,
      },
    ],
  };
}

export function uploadedBaseLayout({
  fileName,
  fileType,
  dataUrl,
  previewHtml,
  elements,
}: {
  fileName: string;
  fileType: string;
  dataUrl: string;
  previewHtml?: string;
  elements?: TemplateElement[];
}): TemplateLayout {
  return {
    baseFileName: fileName,
    baseFileType: fileType,
    baseFileDataUrl: dataUrl,
    basePreviewHtml: previewHtml,
    elements: [
      ...(elements ?? []),
      {
        id: "qr",
        type: "qr",
        content: "",
        variableRequired: true,
        x: 965,
        y: 635,
        width: 105,
        height: 105,
        fontSize: 12,
        fontFamily: "Arial",
        color: "#111827",
        align: "center",
        bold: false,
      },
    ],
  };
}

export function isDefaultStarterLayout(layout: TemplateLayout) {
  const ids = layout.elements.map((element) => element.id).sort();
  return ids.join(",") === "body,qr,recipient,title";
}
