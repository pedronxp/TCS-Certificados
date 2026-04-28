import { BatchForm } from "@/components/certificates/batch-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BatchCertificatePage() {
  const [templates, batches] = await Promise.all([
    prisma.certificateTemplate.findMany({
      select: {
        id: true,
        name: true,
        variables: {
          select: { id: true, key: true, label: true, required: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.certificateBatch.findMany({
      include: {
        template: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Emissao em lote</h1>
      <p className="mt-1 text-sm text-slate-500">
        Gere varios certificados pelo modelo cadastrado, mantendo empresa e data iguais para todos.
      </p>
      <div className="mt-6">
        {templates.length ? (
          <BatchForm templates={templates} />
        ) : (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Crie um modelo antes de importar planilhas.
          </p>
        )}
      </div>

      <section className="mt-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-bold">Historico de lotes</h2>
          <p className="mt-1 text-sm text-slate-500">Acompanhe os ultimos lotes gerados no sistema.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Inicio</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progresso</th>
                <th className="px-4 py-3">Erros</th>
                <th className="px-4 py-3">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((batch) => {
                const errors = Array.isArray(batch.errors) ? batch.errors : [];
                return (
                  <tr key={batch.id}>
                    <td className="px-4 py-3">{formatDateTime(batch.startedAt)}</td>
                    <td className="px-4 py-3 font-medium">{batch.template.name}</td>
                    <td className="px-4 py-3">{batch.company}</td>
                    <td className="px-4 py-3">{batch.issuedDate}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">{batch.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {batch.processed}/{batch.total} processados, {batch.created} gerados
                    </td>
                    <td className="px-4 py-3">{errors.length}</td>
                    <td className="px-4 py-3">{batch.createdBy.name}</td>
                  </tr>
                );
              })}
              {!batches.length ? (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={8}>
                    Nenhum lote gerado ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}
