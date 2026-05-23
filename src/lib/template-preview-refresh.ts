import { Prisma } from "@prisma/client";
import {
  preserveManualNativeDocxElements,
  templateLayoutSchema,
  type TemplateLayout,
  uploadedBaseLayout,
} from "@/lib/certificate-layout";
import { buildDocxPreview } from "@/lib/docx-preview-service";
import { prisma } from "@/lib/prisma";

type RefreshableTemplate = {
  id: string;
  width: number;
  height: number;
  orientation: string;
  layout: unknown;
};

const TRUSTED_DOCX_RENDER_ENGINES = new Set([
  "gotenberg",
  "libreoffice",
  "cloudconvert-office",
  "iloveapi-office",
]);
const DEFAULT_RETRY_MINUTES = 30;

export async function refreshDocxTemplatePreviewIfNeeded<T extends RefreshableTemplate>(template: T): Promise<T> {
  const parsed = templateLayoutSchema.safeParse(template.layout);
  if (!parsed.success) return template;

  const layout = parsed.data;
  if (!isRefreshableDocxLayout(layout)) return template;
  if (layout.baseRenderEngine && TRUSTED_DOCX_RENDER_ENGINES.has(layout.baseRenderEngine)) return template;
  if (hasRecentConversionFailure(layout)) return template;

  const sourceBuffer = dataUrlToBuffer(layout.baseFileDataUrl);
  if (!sourceBuffer.length) return template;

  const preview = await buildDocxPreview(sourceBuffer, { allowExternalConversion: true });
  const attemptedAt = new Date().toISOString();
  if (!TRUSTED_DOCX_RENDER_ENGINES.has(preview.renderEngine)) {
    await markConversionFailure(template, layout, attemptedAt, preview.renderEngine || "unavailable");
    return {
      ...template,
      layout: {
        ...layout,
        baseConversionAttemptedAt: attemptedAt,
        baseConversionFailureAt: attemptedAt,
        baseConversionFailureReason: preview.renderEngine || "unavailable",
      },
    };
  }

  const nextLayout = uploadedBaseLayout({
    fileName: layout.baseFileName ?? "modelo.docx",
    fileType: layout.baseFileType ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    dataUrl: layout.baseFileDataUrl,
    previewHtml: preview.previewHtml,
    renderDataUrl: preview.renderDataUrl,
    renderFileType: preview.renderFileType,
    renderEngine: preview.renderEngine,
    imageDataUrl: preview.imageDataUrl,
    imageEngine: preview.imageEngine,
    pages: preview.pages,
    elements: preserveManualNativeDocxElements(layout.elements),
    pageBorder: preview.page.border,
    assets: preview.assets,
    baseDocumentMode: "native",
  });
  nextLayout.variableDefinitions = layout.variableDefinitions;
  nextLayout.baseConversionAttemptedAt = attemptedAt;
  nextLayout.baseConversionFailureAt = undefined;
  nextLayout.baseConversionFailureReason = undefined;
  const firstPage = preview.pages[0] ?? preview.page;
  const nextTemplate = {
    ...template,
    width: firstPage?.width ?? template.width,
    height: firstPage?.height ?? template.height,
    orientation: firstPage?.orientation ?? template.orientation,
    layout: nextLayout,
  };

  await prisma.certificateTemplate.update({
    where: { id: template.id },
    data: {
      width: nextTemplate.width,
      height: nextTemplate.height,
      orientation: nextTemplate.orientation,
      layout: nextLayout as Prisma.InputJsonValue,
    },
  });

  return nextTemplate;
}

async function markConversionFailure(
  template: RefreshableTemplate,
  layout: TemplateLayout,
  attemptedAt: string,
  reason: string,
) {
  await prisma.certificateTemplate.update({
    where: { id: template.id },
    data: {
      layout: {
        ...layout,
        baseConversionAttemptedAt: attemptedAt,
        baseConversionFailureAt: attemptedAt,
        baseConversionFailureReason: reason,
      } as Prisma.InputJsonValue,
    },
  });
}

function isRefreshableDocxLayout(layout: TemplateLayout) {
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  return layout.baseDocumentMode !== "editable" &&
    Boolean(layout.baseFileDataUrl) &&
    (fileType.includes("wordprocessingml") || fileName.endsWith(".docx"));
}

function dataUrlToBuffer(dataUrl: string | undefined) {
  if (!dataUrl) return Buffer.alloc(0);
  const [, base64 = ""] = dataUrl.split(",", 2);
  return Buffer.from(base64, "base64");
}

function hasRecentConversionFailure(layout: TemplateLayout) {
  if (!layout.baseConversionFailureAt) return false;

  const failedAt = Date.parse(layout.baseConversionFailureAt);
  if (!Number.isFinite(failedAt)) return false;

  return Date.now() - failedAt < conversionRetryMs();
}

function conversionRetryMs() {
  const value = Number.parseInt(process.env.TEMPLATE_PREVIEW_REFRESH_RETRY_MINUTES ?? "", 10);
  const minutes = Number.isFinite(value) && value > 0 ? value : DEFAULT_RETRY_MINUTES;
  return minutes * 60 * 1000;
}
