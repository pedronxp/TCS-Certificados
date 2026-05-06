import { Prisma } from "@prisma/client";
import {
  extractVariables,
  normalizeVariableKey,
  uploadedBaseLayout,
  type TemplateLayout,
  type TemplateVariableDefinition,
} from "@/lib/certificate-layout";
import { buildDocxPreview } from "@/lib/docx-preview-service";
import { prisma } from "@/lib/prisma";

type ImportedTemplateDraft = {
  name: string;
  description: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  background: string | null;
  layout: TemplateLayout;
};

type ImportTemplateInput = {
  fileName: string;
  fileType?: string;
  buffer: Buffer;
  createdById: string;
  name?: string;
  description?: string;
  width?: number;
  height?: number;
  orientation?: "landscape" | "portrait";
  variableDefinitions?: TemplateVariableDefinition[];
};

const DEFAULT_PAGE = {
  width: 1123,
  height: 794,
  orientation: "landscape" as const,
};

export async function createTemplateFromImportedFile(input: ImportTemplateInput) {
  const draft = await buildImportedTemplateDraft(input);
  const variables = extractVariables(draft.layout);

  return prisma.certificateTemplate.create({
    data: {
      name: draft.name,
      description: draft.description,
      width: draft.width,
      height: draft.height,
      orientation: draft.orientation,
      background: draft.background,
      layout: draft.layout as Prisma.InputJsonValue,
      createdById: input.createdById,
      variables: { create: variables },
    },
    include: { variables: true },
  });
}

async function buildImportedTemplateDraft(input: ImportTemplateInput): Promise<ImportedTemplateDraft> {
  const fileType = inferFileType(input.fileName, input.fileType);
  const dataUrl = bufferToDataUrl(input.buffer, fileType);
  const fallbackName = input.fileName.replace(/\.[^.]+$/, "") || "Novo certificado";
  const name = cleanText(input.name) || fallbackName;
  const description = cleanText(input.description) || `Modelo enviado a partir de ${input.fileName}`;

  if (isDocx(input.fileName, fileType)) {
    const preview = await buildDocxPreview(input.buffer);
    const orientation = input.orientation ?? preview.page.orientation;
    const layout = uploadedBaseLayout({
      fileName: input.fileName,
      fileType,
      dataUrl,
      previewHtml: preview.previewHtml,
      renderDataUrl: preview.renderDataUrl,
      renderFileType: preview.renderFileType,
      renderEngine: preview.renderEngine,
      imageDataUrl: preview.imageDataUrl,
      imageEngine: preview.imageEngine,
      pages: preview.pages,
      elements: [],
      pageBorder: preview.page.border,
      baseDocumentMode: "native",
    });

    return {
      name,
      description,
      width: positiveNumberOrDefault(input.width, preview.page.width),
      height: positiveNumberOrDefault(input.height, preview.page.height),
      orientation,
      background: null,
      layout: withVariableDefinitions(layout, input.variableDefinitions),
    };
  }

  const orientation = input.orientation ?? DEFAULT_PAGE.orientation;
  const layout = uploadedBaseLayout({
    fileName: input.fileName,
    fileType,
    dataUrl,
    elements: [],
  });

  return {
    name,
    description,
    width: positiveNumberOrDefault(input.width, DEFAULT_PAGE.width),
    height: positiveNumberOrDefault(input.height, DEFAULT_PAGE.height),
    orientation,
    background: fileType.startsWith("image/") ? dataUrl : null,
    layout: withVariableDefinitions(layout, input.variableDefinitions),
  };
}

export function normalizeImportVariableDefinitions(value: unknown): TemplateVariableDefinition[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const key = normalizeVariableKey(String(raw.key ?? ""));
      const label = cleanText(raw.label) || key;
      if (!key || !label) return null;
      return {
        key,
        label,
        required: typeof raw.required === "boolean" ? raw.required : true,
      };
    })
    .filter((item): item is TemplateVariableDefinition => Boolean(item));
}

export function normalizeImportVariableLabels(value: unknown): TemplateVariableDefinition[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>)
    .map(([rawKey, rawLabel]) => {
      const key = normalizeVariableKey(rawKey);
      const label = cleanText(rawLabel) || key;
      if (!key || !label) return null;
      return { key, label, required: true };
    })
    .filter((item): item is TemplateVariableDefinition => Boolean(item));
}

function withVariableDefinitions(layout: TemplateLayout, definitions: TemplateVariableDefinition[] | undefined) {
  const normalized = normalizeImportVariableDefinitions(definitions);
  return normalized.length > 0 ? { ...layout, variableDefinitions: normalized } : layout;
}

function inferFileType(fileName: string, fileType: string | undefined) {
  if (fileType && fileType !== "application/octet-stream") return fileType;

  const lower = fileName.toLowerCase();
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function isDocx(fileName: string, fileType: string) {
  return fileType.includes("wordprocessingml") || fileName.toLowerCase().endsWith(".docx");
}

function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
