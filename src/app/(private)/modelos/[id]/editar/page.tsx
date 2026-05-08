import { notFound } from "next/navigation";
import { EditorShell } from "@/components/editor/editor-shell";
import { normalizeVisualDocxLayout, templateLayoutSchema } from "@/lib/certificate-layout";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const template = await prisma.certificateTemplate.findUnique({ where: { id } });
  if (!template) notFound();

  return (
    <EditorShell
      initial={{
        id: template.id,
        name: template.name,
        description: template.description,
        width: template.width,
        height: template.height,
        orientation: template.orientation,
        background: template.background,
        layout: normalizeVisualDocxLayout(templateLayoutSchema.parse(template.layout)),
      }}
    />
  );
}
