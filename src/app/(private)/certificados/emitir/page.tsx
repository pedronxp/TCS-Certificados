import { IssueForm } from "@/components/certificates/issue-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function IssueCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const selectedTemplateId = (await searchParams).template;
  const templates = await prisma.certificateTemplate.findMany({
    include: { variables: { orderBy: { key: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Emitir certificado</h1>
      <p className="mt-1 text-sm text-slate-500">Preencha as variáveis do modelo e gere os arquivos finais.</p>
      <div className="mt-6">
        {templates.length ? <IssueForm templates={templates} initialTemplateId={selectedTemplateId} /> : <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Crie um modelo antes de emitir certificados.</p>}
      </div>
    </div>
  );
}
