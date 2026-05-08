import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LogIn, QrCode, SearchCheck, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SensitiveDocumentInput } from "@/components/sensitive-document-input";
import { normalizeVerificationCode } from "@/lib/verification-code";

export const metadata: Metadata = {
  title: "Validar certificado - TCS Certificados",
  description: "Consulte a autenticidade de um certificado sem fazer login.",
};

type ValidateSearchParams = {
  codigo?: string | string[];
  documento?: string | string[];
};

export default async function PublicValidationSearchPage({
  searchParams,
}: {
  searchParams: Promise<ValidateSearchParams>;
}) {
  const params = await searchParams;
  const codigo = normalizeVerificationCode(params.codigo);
  const documentoParam = params.documento;
  const documento = Array.isArray(documentoParam) ? documentoParam[0] : documentoParam;

  if (codigo) {
    const query = documento?.trim() ? `?documento=${encodeURIComponent(documento.trim())}` : "";
    redirect(`/validar/${encodeURIComponent(codigo)}${query}`);
  }

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
              <span className="sidebar-logo-subtitle">Consulta p&uacute;blica</span>
            </span>
          </Link>
        </div>

        <div className="public-validation-grid">
          <article className="public-validation-result">
            <span className="chip chip-brand">
              <ShieldCheck className="size-4" />
              Valida&ccedil;&atilde;o sem login
            </span>
            <h1>Valide seu certificado</h1>
            <p>
              Digite exatamente o c&oacute;digo de valida&ccedil;&atilde;o impresso no certificado ou lido
              pelo QR Code para conferir a autenticidade do documento sem acessar a plataforma.
            </p>

            <form action="/validar" className="public-validation-form public-validation-form-wide" method="get">
              <label className="field">
                <span className="field-label">C&oacute;digo de valida&ccedil;&atilde;o</span>
                <input
                  name="codigo"
                  type="text"
                  required
                  autoCapitalize="characters"
                  autoComplete="off"
                  inputMode="text"
                  minLength={4}
                  placeholder="Ex.: TCS-BR-2026-0042"
                />
              </label>

              <label className="field">
                <span className="field-label">Documento do participante</span>
                <small className="public-field-hint">
                  Informe o CPF, RG ou documento que aparece no certificado para liberar a confer&ecirc;ncia.
                </small>
                <SensitiveDocumentInput
                  name="documento"
                  required
                  autoComplete="off"
                  inputMode="text"
                  placeholder="Ex.: 123.456.789-00 ou MG 12.345.678"
                />
              </label>

              <button className="btn btn-primary" type="submit">
                <SearchCheck className="size-4" />
                Verificar documento
              </button>
            </form>

            <div className="public-validation-actions">
              <Link className="btn btn-ghost" href="/login">
                <LogIn className="size-4" />
                Entrar na plataforma
              </Link>
            </div>
          </article>

          <aside className="public-validation-side">
            <div className="public-validation-seal">
              <QrCode className="size-12" />
            </div>
            <h2>Onde encontrar o c&oacute;digo</h2>
            <p>
              O c&oacute;digo completo aparece no certificado junto ao QR Code. A consulta aceita
              certificados antigos com c&oacute;digos sem padr&atilde;o e certificados novos com numera&ccedil;&atilde;o.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
