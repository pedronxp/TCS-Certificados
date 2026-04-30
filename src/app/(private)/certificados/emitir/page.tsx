import Link from "next/link";
import { History } from "lucide-react";
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Emitir certificado</h1>
          <p className="mt-1 text-sm text-slate-500">Selecione o modelo e preencha os campos obrigatórios.</p>
        </div>
        <Link
          href="/certificados/historico"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <History className="size-4" />
          Histórico
        </Link>
      </div>

      <div className="mt-6">
        {templates.length ? (
          <IssueForm templates={templates} initialTemplateId={selectedTemplateId} />
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Crie um modelo antes de emitir certificados.
          </p>
        )}
      </div>
    </div>
  );
}
