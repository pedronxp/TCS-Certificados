import Link from "next/link";
import { RevokeButton } from "@/components/certificates/revoke-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CertificateHistoryPage() {
  const issues = await prisma.certificateIssue.findMany({
    include: { recipient: true, template: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">Histórico</h1>
      <p className="mt-1 text-sm text-slate-500">Consulte certificados emitidos e baixe os arquivos gerados.</p>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Titular</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td className="px-4 py-3 font-medium">{issue.recipient.name}</td>
                  <td className="px-4 py-3">{issue.template.name}</td>
                  <td className="px-4 py-3">
                    <Link className="font-mono text-teal-700 hover:underline" href={`/validar/${issue.verificationCode}`}>
                      {issue.verificationCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{issue.status}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <a className="rounded bg-slate-100 px-2 py-1 font-semibold hover:bg-slate-200" href={`/api/certificates/${issue.id}/download/pdf`}>PDF</a>
                      <a className="rounded bg-slate-100 px-2 py-1 font-semibold hover:bg-slate-200" href={`/api/certificates/${issue.id}/download/docx`}>DOCX</a>
                      <RevokeButton id={issue.id} disabled={issue.status === "REVOKED"} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
