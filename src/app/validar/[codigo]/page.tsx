import Link from "next/link";
import { CheckCircle2, Clock3, MessageCircle, Search, ShieldCheck, XCircle } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";
import { normalizeVerificationCode } from "@/lib/verification-code";

export const dynamic = "force-dynamic";

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo: rawCodigo } = await params;
  const codigo = normalizeVerificationCode(rawCodigo);
  await expireScheduledCertificateDocuments().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const issue = await findIssueByCode(codigo);
  const canonicalCode = issue?.verificationCode ?? codigo;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const validationUrl = `${appUrl.replace(/\/$/, "")}/validar/${canonicalCode}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Confira a validação do certificado: ${validationUrl}`)}`;
  const expired = isCertificateDocumentExpired(issue?.deleteAt ?? null);
  const valid = issue?.status === "ISSUED";
  const validationState = getValidationState({ valid, expired });

  return (
    <main className="public-validation-page">
      <section className="public-validation-card">
        <div className="public-validation-brand">
          <Link href="/" className="sidebar-logo-link">
            <span className="sidebar-logo-mark brand-logo-mark" aria-hidden="true">
              <BrandLogo decorative priority sizes="56px" />
            </span>
            <span className="sidebar-logo-text">
              <span className="sidebar-logo-title">TCS Certificados</span>
              <span className="sidebar-logo-subtitle">Validação pública</span>
            </span>
          </Link>
        </div>

        {issue ? (
          <div className="public-validation-grid">
            <article className="public-validation-result">
              <span className={`chip ${validationState.chipClass}`}>
                {validationState.icon}
                {validationState.label}
              </span>
              <h1>{validationState.title}</h1>
              <p>
                {validationState.description} Codigo
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
                  <dd>{validationState.statusLabel}</dd>
                </div>
                {expired && issue.deleteAt ? (
                  <div>
                    <dt>Expiracao</dt>
                    <dd>{issue.deleteAt.toLocaleDateString("pt-BR")}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="public-validation-actions">
                <a className="btn btn-primary" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" />
                  Compartilhar no WhatsApp
                </a>
                <Link className="btn btn-ghost" href="/validar">
                  <Search className="size-4" />
                  Consultar outro c&oacute;digo
                </Link>
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
            <div className="public-validation-actions">
              <Link className="btn btn-ghost" href="/validar">
                <Search className="size-4" />
                Consultar outro c&oacute;digo
              </Link>
            </div>
          </article>
        )}
      </section>
    </main>
  );
}

function getValidationState({
  valid,
  expired,
}: {
  valid: boolean;
  expired: boolean;
}) {
  if (expired) {
    return {
      chipClass: "chip-warning",
      icon: <Clock3 className="size-4" />,
      label: "Documento expirado",
      title: "Codigo encontrado",
      description: "O certificado foi encontrado, mas o documento nao esta mais disponivel porque expirou.",
      statusLabel: "Documento expirado",
    };
  }

  if (valid) {
    return {
      chipClass: "chip-success",
      icon: <CheckCircle2 className="size-4" />,
      label: "Certificado valido",
      title: "Autenticidade confirmada",
      description: "Este link publico confirma a emissao e integridade do certificado.",
      statusLabel: "Valido",
    };
  }

  return {
    chipClass: "chip-danger",
    icon: <XCircle className="size-4" />,
    label: "Certificado revogado",
    title: "Validacao com restricao",
    description: "Este link publico confirma a emissao, mas o certificado possui restricao.",
    statusLabel: "Revogado",
  };
}

async function findIssueByCode(code: string) {
  const include = { recipient: true, template: true } as const;
  const issue = await prisma.certificateIssue.findUnique({
    where: { verificationCode: code },
    include,
  });
  if (issue) return issue;

  const numericSequence = /^\d+$/.test(code) ? Number.parseInt(code, 10) : null;
  if (!numericSequence) return null;

  return prisma.certificateIssue.findFirst({
    where: {
      verificationCode: {
        endsWith: `-${String(numericSequence).padStart(4, "0")}`,
      },
    },
    include,
    orderBy: { issuedAt: "desc" },
  });
}
