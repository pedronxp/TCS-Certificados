import { Prisma } from "@prisma/client";
import {
  extractVariables,
  preserveManualNativeDocxElements,
  templateLayoutSchema,
  type TemplateLayout,
} from "@/lib/certificate-layout";
import { applyDocxAssetReplacements, buildDocxPreview } from "@/lib/docx-preview-service";
import { prisma } from "@/lib/prisma";

export async function readTemplateDocx(templateId: string) {
  const template = await prisma.certificateTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      createdById: true,
      layout: true,
    },
  });

  if (!template) return null;

  const layout = templateLayoutSchema.parse(template.layout);
  if (!layout.baseFileDataUrl || !layout.baseFileType?.includes("wordprocessingml")) {
    return null;
  }

  const source = Buffer.from(layout.baseFileDataUrl.split(",").at(-1) ?? "", "base64");
  const content = await applyDocxAssetReplacements(source, layout.baseAssets);

  return {
    template,
    layout,
    content,
    version: String(template.updatedAt.getTime()),
  };
}

export async function saveTemplateDocx(templateId: string, buffer: Buffer) {
  const template = await prisma.certificateTemplate.findUnique({
    where: { id: templateId },
    select: {
      width: true,
      height: true,
      orientation: true,
      layout: true,
    },
  });

  if (!template) return null;

  const currentLayout = templateLayoutSchema.parse(template.layout);
  const preview = await buildDocxPreview(buffer);
  const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${buffer.toString("base64")}`;
  const nextLayout: TemplateLayout = {
    ...currentLayout,
    baseDocumentMode: "native",
    baseFileDataUrl: dataUrl,
    basePreviewHtml: preview.previewHtml,
    baseRenderDataUrl: preview.renderDataUrl,
    baseRenderFileType: preview.renderFileType,
    baseRenderEngine: preview.renderEngine,
    baseImageDataUrl: preview.imageDataUrl,
    baseImageEngine: preview.imageEngine,
    basePages: preview.pages,
    baseAssets: preview.assets,
    elements: preserveManualNativeDocxElements(currentLayout.elements),
  };
  const firstPage = preview.pages[0] ?? preview.page;
  const variables = extractVariables(nextLayout);

  const updated = await prisma.certificateTemplate.update({
    where: { id: templateId },
    data: {
      width: firstPage?.width ?? template.width,
      height: firstPage?.height ?? template.height,
      orientation: firstPage?.orientation ?? template.orientation,
      layout: nextLayout as Prisma.InputJsonValue,
      variables: {
        deleteMany: {},
        create: variables,
      },
    },
    select: { updatedAt: true },
  });

  return {
    version: String(updated.updatedAt.getTime()),
  };
}
