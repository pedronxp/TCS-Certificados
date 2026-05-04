import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LogIn, QrCode, SearchCheck, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { normalizeVerificationCode } from "@/lib/verification-code";

export const metadata: Metadata = {
  title: "Validar certificado - TCS Certificados",
  description: "Consulte a autenticidade de um certificado sem fazer login.",
};

type ValidateSearchParams = {
  codigo?: string | string[];
};

export default async function PublicValidationSearchPage({
  searchParams,
}: {
  searchParams: Promise<ValidateSearchParams>;
}) {
  const codigo = normalizeVerificationCode((await searchParams).codigo);

  if (codigo) {
    redirect(`/validar/${encodeURIComponent(codigo)}`);
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

            <form action="/validar" className="public-validation-form" method="get">
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
                  placeholder="Ex.: 5_8FLUDNR6XI"
                />
              </label>

              <button className="btn btn-primary" type="submit">
                <SearchCheck className="size-4" />
                Consultar certificado
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
              O c&oacute;digo aparece no certificado junto ao QR Code. A consulta aceita certificados
              antigos com c&oacute;digos sem padr&atilde;o e certificados novos com numera&ccedil;&atilde;o.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
