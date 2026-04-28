import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const issue = await prisma.certificateIssue.findUnique({
    where: { verificationCode: codigo },
    include: { recipient: true, template: true },
  });

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-950">
      <section className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link href="/" className="text-sm font-bold text-teal-700">TCS Certificados</Link>
        {issue ? (
          <div className="mt-6">
            <span className={`rounded px-2 py-1 text-xs font-bold ${issue.status === "ISSUED" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {issue.status === "ISSUED" ? "Certificado válido" : "Certificado revogado"}
            </span>
            <h1 className="mt-4 text-2xl font-bold">{issue.recipient.name}</h1>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-slate-500">Modelo</dt>
                <dd className="font-medium">{issue.template.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Código</dt>
                <dd className="font-mono font-medium">{issue.verificationCode}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Emissão</dt>
                <dd className="font-medium">{issue.issuedAt.toLocaleDateString("pt-BR")}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Status</dt>
                <dd className="font-medium">{issue.status}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="mt-6">
            <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">Código não encontrado</span>
            <h1 className="mt-4 text-2xl font-bold">Não foi possível validar este certificado</h1>
            <p className="mt-2 text-slate-500">Confira o código informado ou solicite um novo link de validação.</p>
          </div>
        )}
      </section>
    </main>
  );
}
