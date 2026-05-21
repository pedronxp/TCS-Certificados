import { z } from "zod";
import {
  getTemplateVariableDefaultRequired,
  getTemplateVariableLabel,
} from "@/lib/template-variable-fields";
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
  zIndex: z.number().int().optional(),
});

export const templateVariableDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  required: z.boolean().default(true),
});

export const templateBaseAssetSchema = z.object({
  path: z.string(),
  name: z.string(),
  contentType: z.string(),
  dataUrl: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  replacementDataUrl: z.string().optional(),
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
  baseAssets: z.array(templateBaseAssetSchema).optional(),
});

export type TemplateElement = z.infer<typeof templateElementSchema>;
export type TemplateLayout = z.infer<typeof templateLayoutSchema>;
export type TemplateVariableDefinition = z.infer<typeof templateVariableDefinitionSchema>;
export type TemplatePageBorder = z.infer<typeof templatePageBorderSchema>;
export type TemplateLayoutPage = z.infer<typeof templateLayoutPageSchema>;
export type TemplateBaseAsset = z.infer<typeof templateBaseAssetSchema>;

export function extractVariables(layout: TemplateLayout) {
  const variables = new Map<string, { label: string; required: boolean }>();

  if (shouldUseBasePreviewVariables(layout)) {
    for (const key of extractVariableKeys(layout.basePreviewHtml ?? "")) {
      if (isSystemCertificateVariableKey(key)) continue;
      variables.set(key, {
        label: labelFromKey(key),
        required: getTemplateVariableDefaultRequired({ key }),
      });
    }

    for (const key of extractVariableKeys(stripHtml(layout.basePreviewHtml ?? ""))) {
      if (isSystemCertificateVariableKey(key)) continue;
      variables.set(key, {
        label: labelFromKey(key),
        required: getTemplateVariableDefaultRequired({ key }),
      });
    }
  }

  for (const element of layout.elements) {
    for (const key of extractVariableKeys(element.content)) {
      if (isSystemCertificateVariableKey(key)) continue;
      variables.set(key, {
        label: labelFromKey(key),
        required: getTemplateVariableDefaultRequired({ key }),
      });
    }
  }

  for (const definition of layout.variableDefinitions ?? []) {
    if (!definition.key) continue;
    if (isSystemCertificateVariableKey(definition.key)) continue;
    variables.set(definition.key, {
      label: definition.label?.trim() || labelFromKey(definition.key),
      required: getTemplateVariableDefaultRequired({
        key: definition.key,
        label: definition.label,
      }) && definition.required,
    });
  }

  for (const element of layout.elements) {
    if (element.type === "variable" && element.variableKey) {
      if (isSystemCertificateVariableKey(element.variableKey)) continue;
      variables.set(element.variableKey, {
        label: element.variableLabel?.trim() || labelFromKey(element.variableKey),
        required: getTemplateVariableDefaultRequired({
          key: element.variableKey,
          label: element.variableLabel,
        }) && element.variableRequired,
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
  assets,
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
  assets?: TemplateBaseAsset[];
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
    baseAssets: assets,
    elements: elements ?? [],
  };
}

export function normalizeVisualDocxLayout(layout: TemplateLayout): TemplateLayout {
  if (!isDocxBaseLayout(layout)) return layout;

  return {
    ...layout,
    baseDocumentMode: "native",
    elements: preserveManualNativeDocxElements(layout.elements),
  };
}

export function shouldNormalizeVisualDocxLayout() {
  return true;
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

export function preserveManualNativeDocxElements(elements: TemplateElement[]) {
  return elements.filter((element) => !isAutoExtractedDocxElement(element));
}

function isDocxBaseLayout(layout: TemplateLayout) {
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl?.toLowerCase() ?? "";

  return Boolean(
    fileType.includes("wordprocessingml") ||
      fileName.endsWith(".docx") ||
      dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml"),
  );
}

function isAutoExtractedDocxElement(element: TemplateElement) {
  if (element.type === "qr") return false;
  if (element.id.startsWith("watermark-")) return true;

  if ((element.type === "text" || element.type === "variable") && hasUuidPrefix(element.id, "text")) {
    return true;
  }

  if (element.type === "image" && hasUuidPrefix(element.id, "image")) {
    return true;
  }

  return false;
}

function hasUuidPrefix(id: string, prefix: string) {
  return new RegExp(`^${prefix}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i").test(id);
}
