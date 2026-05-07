import { Prisma } from "@prisma/client";
import { extractVariables, templateLayoutSchema, type TemplateLayout } from "../src/lib/certificate-layout";
import { buildDocxPreview } from "../src/lib/docx-preview-service";
import { prisma } from "../src/lib/prisma";

const force = process.argv.includes("--force");

async function main() {
  const templates = await prisma.certificateTemplate.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      width: true,
      height: true,
      orientation: true,
      layout: true,
    },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const template of templates) {
    const layout = templateLayoutSchema.parse(template.layout);

    if (!shouldUpgrade(layout, force)) {
      skipped += 1;
      continue;
    }

    try {
      const source = dataUrlToBuffer(layout.baseFileDataUrl!);
      const preview = await buildDocxPreview(source);

      const firstPage = preview.pages[0] ?? preview.page;
      const nextLayout: TemplateLayout = {
        ...layout,
        baseDocumentMode: "native",
        basePreviewHtml: preview.previewHtml || layout.basePreviewHtml,
        baseRenderDataUrl: preview.renderDataUrl || layout.baseRenderDataUrl,
        baseRenderFileType: preview.renderFileType || layout.baseRenderFileType,
        baseRenderEngine: preview.renderEngine || layout.baseRenderEngine,
        baseImageDataUrl: preview.imageDataUrl || layout.baseImageDataUrl,
        baseImageEngine: preview.imageEngine || layout.baseImageEngine,
        basePages: preview.pages.length > 0 ? preview.pages : layout.basePages,
        baseAssets: preview.assets,
        elements: [],
      };
      const variables = extractVariables(nextLayout);

      await prisma.certificateTemplate.update({
        where: { id: template.id },
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
      });

      updated += 1;
      console.log(`OK   ${template.name}: ${preview.assets.length} imagens`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${template.name}:`, error);
    }
  }

  console.log(`Concluido. Atualizados: ${updated}. Ignorados: ${skipped}. Falhas: ${failed}.`);
}

function shouldUpgrade(layout: TemplateLayout, forceUpgrade = false) {
  if (!layout.baseFileDataUrl || !isDocxLayout(layout)) return false;
  if (forceUpgrade) return true;
  if (layout.baseDocumentMode !== "native") return true;
  if (!layout.baseAssets || layout.baseAssets.length === 0) return true;
  return false;
}

function isDocxLayout(layout: TemplateLayout) {
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl?.toLowerCase() ?? "";

  return (
    fileName.endsWith(".docx") ||
    fileType.includes("wordprocessingml") ||
    dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml")
  );
}

function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
