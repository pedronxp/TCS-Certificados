import Link from "next/link";
import { notFound } from "next/navigation";
import { LibreOfficeDocxEditor } from "@/components/editor/libreoffice-docx-editor";
import { requireAdmin } from "@/lib/auth";
import { templateLayoutSchema } from "@/lib/certificate-layout";
import {
  collaboraEditorUrl,
  createCollaboraAccessToken,
} from "@/lib/collabora";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OfficeTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const template = await prisma.certificateTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      layout: true,
    },
  });
  if (!template) notFound();

  const layout = templateLayoutSchema.parse(template.layout);
  if (!layout.baseFileDataUrl || !layout.baseFileType?.includes("wordprocessingml")) {
    notFound();
  }

  const accessToken = await createCollaboraAccessToken({
    templateId: template.id,
    userId: user.id,
    userName: user.name,
    purpose: "template-docx",
  });
  const editorUrl = collaboraEditorUrl({
    templateId: template.id,
    accessToken,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{template.name}</h1>
          <p className="text-sm text-slate-600">Editor DOCX real via LibreOffice Online</p>
        </div>
        <Link
          href={`/modelos/${template.id}/editar`}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Voltar ao modelo
        </Link>
      </div>

      <LibreOfficeDocxEditor editorUrl={editorUrl} />
    </div>
  );
}
