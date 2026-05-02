import Link from "next/link";
import { CheckCircle2, MessageCircle, ShieldCheck, XCircle } from "lucide-react";
import { deleteExpiredCertificateIssues } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  await deleteExpiredCertificateIssues().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const issue = await prisma.certificateIssue.findUnique({
    where: { verificationCode: codigo },
    include: { recipient: true, template: true },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const validationUrl = `${appUrl.replace(/\/$/, "")}/validar/${codigo}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Confira a validação do certificado: ${validationUrl}`)}`;
  const valid = issue?.status === "ISSUED";

  return (
    <main className="public-validation-page">
      <section className="public-validation-card">
        <div className="public-validation-brand">
          <Link href="/" className="sidebar-logo-link">
            <span className="sidebar-logo-mark">TC</span>
            <span className="sidebar-logo-text">
              <span className="sidebar-logo-title">TCS Certificados</span>
              <span className="sidebar-logo-subtitle">Validação pública</span>
            </span>
          </Link>
        </div>

        {issue ? (
          <div className="public-validation-grid">
            <article className="public-validation-result">
              <span className={`chip ${valid ? "chip-success" : "chip-danger"}`}>
                {valid ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                {valid ? "Certificado válido" : "Certificado revogado"}
              </span>
              <h1>{valid ? "Autenticidade confirmada" : "Validação com restrição"}</h1>
              <p>
                Este link público confirma a emissão e integridade do certificado com código
                {" "}
                <strong>{issue.verificationCode}</strong>.
              </p>

              <dl className="public-validation-list">
                <div>
                  <dt>Participante</dt>
                  <dd>{issue.recipient.name}</dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd>{issue.template.name}</dd>
                </div>
                <div>
                  <dt>Emissão</dt>
                  <dd>{issue.issuedAt.toLocaleDateString("pt-BR")}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{valid ? "Válido" : "Revogado"}</dd>
                </div>
              </dl>

              <div className="public-validation-actions">
                <a className="btn btn-primary" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" />
                  Compartilhar no WhatsApp
                </a>
              </div>
            </article>

            <aside className="public-validation-side">
              <div className="public-validation-seal">
                <ShieldCheck className="size-12" />
              </div>
              <h2>Consulta oficial</h2>
              <p>Use este endereço para conferir se o certificado apresentado corresponde a um registro emitido pela TCS Certificados.</p>
              <code>{issue.verificationCode}</code>
            </aside>
          </div>
        ) : (
          <article className="public-validation-result">
            <span className="chip chip-danger">
              <XCircle className="size-4" />
              Código não encontrado
            </span>
            <h1>Não foi possível validar este certificado</h1>
            <p>Confira o código informado ou solicite um novo link de validação.</p>
          </article>
        )}
      </section>
    </main>
  );
}
