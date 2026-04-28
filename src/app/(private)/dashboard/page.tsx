import Link from "next/link";
import { BadgeCheck, Edit3, FileText, History, Upload } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const templates = await prisma.certificateTemplate.count();
  const issues = await prisma.certificateIssue.count();
  const users = await prisma.user.count();
  const latestIssues = await prisma.certificateIssue.findMany({
    take: 5,
    include: { recipient: true, template: true },
    orderBy: { issuedAt: "desc" },
  });
  const recentTemplates = await prisma.certificateTemplate.findMany({
    take: 6,
    include: {
      variables: true,
      _count: { select: { issues: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Acompanhe modelos, emissões e usuários do sistema.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/modelos" className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Upload className="size-4" />
            Subir modelo
          </Link>
          <Link href="/certificados/emitir" className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
            <BadgeCheck className="size-4" />
            Emitir certificado
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Modelos" value={templates} helper="Layouts disponíveis para emissão" />
        <StatCard label="Certificados" value={issues} helper="Emissões registradas" />
        <StatCard label="Usuários" value={users} helper="Acessos autorizados" />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Modelos recentes</h2>
            <p className="mt-1 text-sm text-slate-500">Acesse rapidamente os modelos mais usados ou editados.</p>
          </div>
          <Link href="/modelos" className="text-sm font-semibold text-teal-700 hover:text-teal-900">
            Ver todos
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recentTemplates.map((template) => (
            <article key={template.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">{template.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                    {template.description || "Modelo sem descrição."}
                  </p>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
                  <FileText className="size-5" />
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded bg-slate-100 px-2 py-1">{template.variables.length} campos</span>
                <span className="rounded bg-slate-100 px-2 py-1">{template._count.issues} emissões</span>
                <span className="rounded bg-slate-100 px-2 py-1">{template.orientation}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link href={`/modelos/${template.id}/editar`} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Edit3 className="size-4" />
                  Editar
                </Link>
                <Link href={`/certificados/emitir?template=${template.id}`} className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800">
                  <BadgeCheck className="size-4" />
                  Emitir
                </Link>
              </div>
            </article>
          ))}
        </div>

        {!recentTemplates.length ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Nenhum modelo cadastrado ainda. Use “Subir modelo” para começar.
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">Últimas emissões</h2>
            <Link href="/certificados/historico" className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900">
              <History className="size-4" />
              Histórico
            </Link>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {latestIssues.map((issue) => (
            <div key={issue.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{issue.recipient.name}</p>
                <p className="text-sm text-slate-500">{issue.template.name} · {issue.verificationCode}</p>
              </div>
              <span className="text-sm text-slate-500">{issue.issuedAt.toLocaleDateString("pt-BR")}</span>
            </div>
          ))}
          {!latestIssues.length ? <p className="px-5 py-6 text-sm text-slate-500">Nenhum certificado emitido ainda.</p> : null}
        </div>
      </section>
    </div>
  );
}
