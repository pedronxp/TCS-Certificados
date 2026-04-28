import Link from "next/link";
import { TemplateActions } from "@/components/templates/template-actions";
import { UploadTemplateButton } from "@/components/templates/upload-template-button";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireAdmin();
  const templates = await prisma.certificateTemplate.findMany({
    include: { variables: true, _count: { select: { issues: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Modelos</h1>
          <p className="mt-1 text-sm text-slate-500">Crie layouts com variáveis e QR Code de validação.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <UploadTemplateButton />
          <Link href="/modelos/novo" className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
            Novo modelo
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article key={template.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <Link href={`/modelos/${template.id}/editar`} className="block hover:text-teal-800">
              <h2 className="font-bold">{template.name}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{template.description || "Sem descrição"}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="rounded bg-slate-100 px-2 py-1">{template.variables.length} variáveis</span>
                <span className="rounded bg-slate-100 px-2 py-1">{template._count.issues} emissões</span>
                <span className="rounded bg-slate-100 px-2 py-1">{template.orientation}</span>
              </div>
            </Link>
            <TemplateActions id={template.id} />
          </article>
        ))}
      </div>
    </div>
  );
}
