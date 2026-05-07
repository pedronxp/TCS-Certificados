import Link from "next/link";
import { headers } from "next/headers";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  MessageCircle,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SensitiveDocumentInput } from "@/components/sensitive-document-input";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";
import {
  maskDocumentForDisplay,
  verifyIssueDocument,
} from "@/lib/public-certificate-validation";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { normalizeVerificationCode } from "@/lib/verification-code";

export const dynamic = "force-dynamic";

const PUBLIC_VALIDATION_RATE_LIMIT_ACTION = "public.validation";
const PUBLIC_VALIDATION_RATE_LIMIT_ATTEMPTS = 60;
const PUBLIC_VALIDATION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type ValidatePageSearchParams = {
  documento?: string | string[];
};

export default async function ValidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<ValidatePageSearchParams>;
}) {
  const { codigo: rawCodigo } = await params;
  const query = await searchParams;
  const codigo = normalizeVerificationCode(rawCodigo);
  const documentParam = Array.isArray(query.documento) ? query.documento[0] : query.documento;
  const documentValue = String(documentParam ?? "").trim();
  const rateLimit = await consumeRateLimit({
    action: PUBLIC_VALIDATION_RATE_LIMIT_ACTION,
    key: getClientIp(await headers()),
    limit: PUBLIC_VALIDATION_RATE_LIMIT_ATTEMPTS,
    windowMs: PUBLIC_VALIDATION_RATE_LIMIT_WINDOW_MS,
  });

  if (!rateLimit.allowed) {
    return <RateLimitedValidation retryAfterSeconds={rateLimit.retryAfterSeconds} />;
  }

  await expireScheduledCertificateDocuments().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const issue = await findIssueByCode(codigo);
  const canonicalCode = issue?.verificationCode ?? codigo;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const validationUrl = `${appUrl.replace(/\/$/, "")}/validar/${canonicalCode}`;
  const validationUrlWithDocument = documentValue
    ? `${validationUrl}?documento=${encodeURIComponent(documentValue)}`
    : validationUrl;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Confira a validacao do certificado: ${validationUrlWithDocument}`,
  )}`;
  const expired = isCertificateDocumentExpired(issue?.deleteAt ?? null);
  const valid = issue?.status === "ISSUED";
  const validationState = getValidationState({ valid, expired });
  const documentCheck = issue
    ? verifyIssueDocument(issue, documentValue)
    : { matched: false, hasInput: Boolean(documentValue) };
  const canShowDocument = Boolean(issue && documentCheck.matched && valid && !expired);
  const publicPdfUrl = `/api/public/certificates/${encodeURIComponent(
    canonicalCode,
  )}/download?type=pdf&documento=${encodeURIComponent(documentValue)}`;

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
              <span className="sidebar-logo-subtitle">Validacao publica</span>
            </span>
          </Link>
        </div>

        {issue && documentCheck.matched ? (
          <div className="public-validation-grid public-validation-grid-document">
            <article className="public-validation-result">
              <span className={`chip ${validationState.chipClass}`}>
                {validationState.icon}
                {validationState.label}
              </span>
              <h1>{validationState.title}</h1>
              <p>
                {validationState.description} Codigo{" "}
                <strong>{issue.verificationCode}</strong>.
              </p>

              <dl className="public-validation-list">
                <div>
                  <dt>Participante</dt>
                  <dd>{issue.recipient.name}</dd>
                </div>
                <div>
                  <dt>Documento conferido</dt>
                  <dd>
                    {maskDocumentForDisplay(issue.recipient.document || documentValue) ||
                      "Documento informado"}
                  </dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd>{issue.template.name}</dd>
                </div>
                <div>
                  <dt>Emissao</dt>
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
                {canShowDocument ? (
                  <a className="btn btn-primary" href={publicPdfUrl} target="_blank" rel="noreferrer">
                    <Download className="size-4" />
                    Abrir PDF
                  </a>
                ) : null}
                <a className="btn btn-ghost" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="size-4" />
                  Compartilhar
                </a>
                <Link className="btn btn-ghost" href="/validar">
                  <Search className="size-4" />
                  Consultar outro codigo
                </Link>
              </div>
            </article>

            <aside className={canShowDocument ? "public-document-viewer" : "public-validation-side"}>
              {canShowDocument ? (
                <>
                  <div className="public-document-viewer-header">
                    <FileText className="size-5" />
                    <div>
                      <h2>Visualizacao do documento</h2>
                      <p>Arquivo liberado apos a conferencia do documento informado.</p>
                    </div>
                  </div>
                  <iframe
                    title={`Certificado ${issue.verificationCode}`}
                    src={publicPdfUrl}
                    loading="lazy"
                  />
                </>
              ) : (
                <>
                  <div className="public-validation-seal">
                    <ShieldCheck className="size-12" />
                  </div>
                  <h2>Consulta oficial</h2>
                  <p>
                    O codigo existe, mas o arquivo publico fica indisponivel quando o certificado
                    esta revogado ou expirado.
                  </p>
                  <code>{issue.verificationCode}</code>
                </>
              )}
            </aside>
          </div>
        ) : issue ? (
          <article className="public-validation-result public-validation-result-narrow">
            <span className={`chip ${documentCheck.hasInput ? "chip-danger" : "chip-warning"}`}>
              <AlertCircle className="size-4" />
              {documentCheck.hasInput ? "Documento nao validado" : "Documento necessario"}
            </span>
            <h1>{documentCheck.hasInput ? "Documento nao confere" : "Informe o documento"}</h1>
            <p>
              O codigo <strong>{issue.verificationCode}</strong> foi encontrado, mas a visualizacao
              publica exige o CPF, RG ou documento do participante para confirmar que o arquivo
              pertence a pessoa correta.
            </p>

            <form action={`/validar/${encodeURIComponent(canonicalCode)}`} className="public-validation-form" method="get">
              <label className="field">
                <span className="field-label">Documento do participante</span>
                <small className="public-field-hint">
                  Use a mesma numeracao informada no certificado. Pontos, tracos e espacos sao opcionais.
                </small>
                <SensitiveDocumentInput
                  name="documento"
                  required
                  autoComplete="off"
                  inputMode="text"
                  defaultValue={documentValue}
                  placeholder="CPF, RG ou documento informado"
                />
              </label>
              <button className="btn btn-primary" type="submit">
                <ShieldCheck className="size-4" />
                Validar documento
              </button>
            </form>

            <div className="public-validation-actions">
              <Link className="btn btn-ghost" href="/validar">
                <Search className="size-4" />
                Consultar outro codigo
              </Link>
            </div>
          </article>
        ) : (
          <article className="public-validation-result public-validation-result-narrow">
            <span className="chip chip-danger">
              <XCircle className="size-4" />
              Codigo nao encontrado
            </span>
            <h1>Nao foi possivel validar este certificado</h1>
            <p>Confira o codigo informado ou solicite um novo link de validacao.</p>
            <div className="public-validation-actions">
              <Link className="btn btn-ghost" href="/validar">
                <Search className="size-4" />
                Consultar outro codigo
              </Link>
            </div>
          </article>
        )}
      </section>
    </main>
  );
}

function RateLimitedValidation({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  const retryMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

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
              <span className="sidebar-logo-subtitle">Validacao publica</span>
            </span>
          </Link>
        </div>

        <article className="public-validation-result public-validation-result-narrow">
          <span className="chip chip-warning">
            <AlertCircle className="size-4" />
            Muitas consultas
          </span>
          <h1>Consulta temporariamente limitada</h1>
          <p>
            Por seguranca, aguarde cerca de {retryMinutes} minuto{retryMinutes > 1 ? "s" : ""} antes
            de consultar outro certificado.
          </p>
          <div className="public-validation-actions">
            <Link className="btn btn-ghost" href="/validar">
              <Search className="size-4" />
              Consultar depois
            </Link>
          </div>
        </article>
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
  return prisma.certificateIssue.findUnique({
    where: { verificationCode: code },
    include: { recipient: true, template: true },
  });
}
