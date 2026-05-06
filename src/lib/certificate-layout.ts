import { z } from "zod";
import { getTemplateVariableLabel } from "@/lib/template-variable-fields";
import { isSystemCertificateVariableKey } from "@/lib/verification-code";

export const templateElementSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "variable", "image", "qr"]),
  content: z.string().default(""),
  variableKey: z.string().optional(),
  variableLabel: z.string().optional(),
  variableRequired: z.boolean().default(true),
  x: z.number().default(80),
  y: z.number().default(80),
  pageIndex: z.number().int().nonnegative().optional(),
  width: z.number().default(260),
  height: z.number().default(56),
  fontSize: z.number().default(28),
  fontFamily: z.string().default("Arial"),
  color: z.string().default("#111827"),
  align: z.enum(["left", "center", "right"]).default("center"),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  lineHeight: z.number().default(1.15),
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

export const templateLayoutPageSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  width: z.number().default(1123),
  height: z.number().default(794),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  imageDataUrl: z.string().optional(),
  border: templatePageBorderSchema.optional(),
});

export const templateLayoutSchema = z.object({
  elements: z.array(templateElementSchema).default([]),
  variableDefinitions: z.array(templateVariableDefinitionSchema).optional(),
  basePages: z.array(templateLayoutPageSchema).optional(),
  baseDocumentMode: z.enum(["native", "editable"]).optional(),
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
export type TemplateLayoutPage = z.infer<typeof templateLayoutPageSchema>;

export function extractVariables(layout: TemplateLayout) {
  const variables = new Map<string, { label: string; required: boolean }>();

  if (shouldUseBasePreviewVariables(layout)) {
    for (const key of extractVariableKeys(layout.basePreviewHtml ?? "")) {
      if (isSystemCertificateVariableKey(key)) continue;
      variables.set(key, {
        label: labelFromKey(key),
        required: true,
      });
    }

    for (const key of extractVariableKeys(stripHtml(layout.basePreviewHtml ?? ""))) {
      if (isSystemCertificateVariableKey(key)) continue;
      variables.set(key, {
        label: labelFromKey(key),
        required: true,
      });
    }
  }

  for (const element of layout.elements) {
    for (const key of extractVariableKeys(element.content)) {
      if (isSystemCertificateVariableKey(key)) continue;
      variables.set(key, {
        label: labelFromKey(key),
        required: true,
      });
    }
  }

  for (const definition of layout.variableDefinitions ?? []) {
    if (!definition.key) continue;
    if (isSystemCertificateVariableKey(definition.key)) continue;
    variables.set(definition.key, {
      label: definition.label?.trim() || labelFromKey(definition.key),
      required: definition.required,
    });
  }

  for (const element of layout.elements) {
    if (element.type === "variable" && element.variableKey) {
      if (isSystemCertificateVariableKey(element.variableKey)) continue;
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
  return getTemplateVariableLabel({ key: normalizeVariableKey(key) });
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
        italic: false,
        underline: false,
        lineHeight: 1.15,
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
        italic: false,
        underline: false,
        lineHeight: 1.15,
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
        italic: false,
        underline: false,
        lineHeight: 1.15,
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
        italic: false,
        underline: false,
        lineHeight: 1.15,
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
  pages,
  elements,
  pageBorder,
  baseDocumentMode,
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
  pages?: TemplateLayoutPage[];
  elements?: TemplateElement[];
  pageBorder?: TemplatePageBorder;
  baseDocumentMode?: TemplateLayout["baseDocumentMode"];
}): TemplateLayout {
  return {
    baseDocumentMode,
    basePages: pages,
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

export function normalizeVisualDocxLayout(layout: TemplateLayout): TemplateLayout {
  if (!shouldNormalizeVisualDocxLayout(layout)) return layout;

  const variableDefinitions = collectLayoutVariableDefinitions(layout);

  return {
    ...layout,
    baseDocumentMode: "native",
    elements: [],
    variableDefinitions: variableDefinitions.length ? variableDefinitions : layout.variableDefinitions,
  };
}

export function shouldNormalizeVisualDocxLayout(layout: TemplateLayout) {
  return (
    layout.baseDocumentMode === "editable" &&
    isDocxBaseLayout(layout) &&
    Boolean(layout.baseFileDataUrl) &&
    (hasVisualBasePreview(layout) || Boolean(layout.basePreviewHtml) || layout.elements.length > 0)
  );
}

export function hasVisualBasePreview(layout: TemplateLayout) {
  return Boolean(
    layout.baseRenderDataUrl ||
      layout.baseImageDataUrl ||
      layout.basePages?.some((page) => Boolean(page.imageDataUrl)),
  );
}

export function isDefaultStarterLayout(layout: TemplateLayout) {
  const ids = layout.elements.map((element) => element.id).sort();
  return ids.join(",") === "body,qr,recipient,title";
}

export function shouldUseBasePreviewVariables(layout: TemplateLayout) {
  return layout.baseDocumentMode !== "editable";
}

function isDocxBaseLayout(layout: TemplateLayout) {
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl?.toLowerCase() ?? "";

  return (
    fileType.includes("wordprocessingml") ||
    fileType.includes("officedocument") ||
    fileName.endsWith(".docx") ||
    dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml")
  );
}

function collectLayoutVariableDefinitions(layout: TemplateLayout) {
  const variables = new Map<string, { label: string; required: boolean }>();

  for (const key of extractVariableKeys(layout.basePreviewHtml ?? "")) {
    if (!isSystemCertificateVariableKey(key)) {
      variables.set(key, { label: labelFromKey(key), required: true });
    }
  }

  for (const element of layout.elements) {
    for (const key of extractVariableKeys(element.content)) {
      if (!isSystemCertificateVariableKey(key) && !variables.has(key)) {
        variables.set(key, { label: labelFromKey(key), required: true });
      }
    }
  }

  for (const definition of layout.variableDefinitions ?? []) {
    if (!definition.key || isSystemCertificateVariableKey(definition.key)) continue;
    variables.set(definition.key, {
      label: definition.label?.trim() || labelFromKey(definition.key),
      required: definition.required,
    });
  }

  for (const element of layout.elements) {
    if (element.type !== "variable" || !element.variableKey) continue;
    if (isSystemCertificateVariableKey(element.variableKey)) continue;
    variables.set(element.variableKey, {
      label: element.variableLabel?.trim() || labelFromKey(element.variableKey),
      required: element.variableRequired,
    });
  }

  return [...variables.entries()].map(([key, variable]) => ({
    key,
    label: variable.label,
    required: variable.required,
  }));
}
