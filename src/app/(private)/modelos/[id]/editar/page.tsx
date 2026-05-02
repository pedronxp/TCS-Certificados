import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/templates/template-editor";
import { templateLayoutSchema } from "@/lib/certificate-layout";
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
    <div>
      <h1 className="mb-5 text-2xl font-bold">Editar modelo</h1>
      <TemplateEditor
        initial={{
          ...template,
          layout: templateLayoutSchema.parse(template.layout),
        }}
      />
    </div>
  );
}
