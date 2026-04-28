import { BatchForm } from "@/components/certificates/batch-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BatchCertificatePage() {
  const templates = await prisma.certificateTemplate.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Emissão em lote</h1>
      <p className="mt-1 text-sm text-slate-500">Importe CSV ou XLSX com colunas iguais às variáveis do modelo.</p>
      <div className="mt-6">
        {templates.length ? <BatchForm templates={templates} /> : <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">Crie um modelo antes de importar planilhas.</p>}
      </div>
    </div>
  );
}
