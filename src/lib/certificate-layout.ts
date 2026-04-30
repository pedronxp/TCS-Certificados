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

export const templateVariableDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean().default(true),
});

export const templatePageBorderSchema = z.object({
  color: z.string().default("#000000"),
  width: z.number().default(1),
  inset: z.number().default(0),
});

export const templateLayoutSchema = z.object({
  elements: z.array(templateElementSchema).default([]),
  variableDefinitions: z.array(templateVariableDefinitionSchema).optional(),
  baseFileName: z.string().optional(),
  baseFileType: z.string().optional(),
  baseFileDataUrl: z.string().optional(),
  basePreviewHtml: z.string().optional(),
  baseRenderDataUrl: z.string().optional(),
  baseRenderFileType: z.string().optional(),
  baseRenderEngine: z.string().optional(),
  baseImageDataUrl: z.string().optional(),
  baseImageEngine: z.string().optional(),
  basePageBorder: templatePageBorderSchema.optional(),
});

export type TemplateElement = z.infer<typeof templateElementSchema>;
export type TemplateLayout = z.infer<typeof templateLayoutSchema>;
export type TemplateVariableDefinition = z.infer<typeof templateVariableDefinitionSchema>;
export type TemplatePageBorder = z.infer<typeof templatePageBorderSchema>;

export function extractVariables(layout: TemplateLayout) {
  const variables = new Map<string, { label: string; required: boolean }>();

  for (const key of extractVariableKeys(layout.basePreviewHtml ?? "")) {
    variables.set(key, {
      label: labelFromKey(key),
      required: true,
    });
  }

  for (const key of extractVariableKeys(stripHtml(layout.basePreviewHtml ?? ""))) {
    variables.set(key, {
      label: labelFromKey(key),
      required: true,
    });
  }

  for (const element of layout.elements) {
    for (const key of extractVariableKeys(element.content)) {
      variables.set(key, {
        label: labelFromKey(key),
        required: true,
      });
    }
  }

  for (const definition of layout.variableDefinitions ?? []) {
    if (!definition.key) continue;
    variables.set(definition.key, {
      label: definition.label?.trim() || labelFromKey(definition.key),
      required: definition.required,
    });
  }

  for (const element of layout.elements) {
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
  const normalizedKey = normalizeVariableKey(key);

  if (
    normalizedKey === "data_extenso" ||
    normalizedKey === "data_extensa" ||
    normalizedKey === "data_por_extenso" ||
    normalizedKey === "data_por_extensa"
  ) {
    return "Data por Extenso";
  }

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

export function extractVariableKeys(text: string) {
  const keys = new Set<string>();

  for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const key = normalizeVariableKey(match[1]);
    if (key) keys.add(key);
  }

  return [...keys];
}

export function fillTemplateText(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawKey) => {
    const originalKey = String(rawKey).trim();
    const normalizedKey = normalizeVariableKey(originalKey);
    return values[normalizedKey] ?? values[originalKey] ?? "";
  });
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
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
  renderDataUrl,
  renderFileType,
  renderEngine,
  imageDataUrl,
  imageEngine,
  elements,
  pageBorder,
}: {
  fileName: string;
  fileType: string;
  dataUrl?: string;
  previewHtml?: string;
  renderDataUrl?: string;
  renderFileType?: string;
  renderEngine?: string;
  imageDataUrl?: string;
  imageEngine?: string;
  elements?: TemplateElement[];
  pageBorder?: TemplatePageBorder;
}): TemplateLayout {
  return {
    baseFileName: fileName,
    baseFileType: fileType,
    baseFileDataUrl: dataUrl,
    basePreviewHtml: previewHtml,
    baseRenderDataUrl: renderDataUrl,
    baseRenderFileType: renderFileType,
    baseRenderEngine: renderEngine,
    baseImageDataUrl: imageDataUrl,
    baseImageEngine: imageEngine,
    basePageBorder: pageBorder,
    elements: elements ?? [],
  };
}

export function isDefaultStarterLayout(layout: TemplateLayout) {
  const ids = layout.elements.map((element) => element.id).sort();
  return ids.join(",") === "body,qr,recipient,title";
}
