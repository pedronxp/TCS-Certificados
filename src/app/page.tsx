import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, FileSearch, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SensitiveDocumentInput } from "@/components/sensitive-document-input";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="public-home-page">
      <section className="public-home-shell">
        <nav className="public-home-nav" aria-label="Acesso principal">
          <Link href="/" className="sidebar-logo-link">
            <span className="sidebar-logo-mark brand-logo-mark" aria-hidden="true">
              <BrandLogo decorative priority sizes="56px" />
            </span>
            <span className="sidebar-logo-text">
              <span className="sidebar-logo-title">TCS Certificados</span>
              <span className="sidebar-logo-subtitle">Emissao e validacao</span>
            </span>
          </Link>
          <Link href="/login" className="btn btn-ghost">
            <LockKeyhole className="size-4" />
            Entrar
          </Link>
        </nav>

        <div className="public-home-grid">
          <section className="public-home-hero">
            <span className="chip chip-brand">
              <ShieldCheck className="size-4" />
              Consulta oficial
            </span>
            <h1>Valide certificados digitais com seguranca.</h1>
            <p>
              Consulte o codigo do certificado, confirme o documento do participante e visualize o
              arquivo quando ele estiver disponivel para consulta publica.
            </p>

            <div className="public-home-actions">
              <Link href="/validar" className="btn btn-primary">
                <FileSearch className="size-4" />
                Validar certificado
              </Link>
              <Link href="/login" className="btn btn-ghost">
                Entrar na plataforma
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          <aside className="public-home-validation">
            <div className="public-home-card-header">
              <BadgeCheck className="size-5" />
              <span>Consulta rapida</span>
            </div>
            <form action="/validar" method="get" className="public-home-form">
              <label className="field">
                <span className="field-label">Codigo de validacao</span>
                <input
                  name="codigo"
                  type="text"
                  required
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="TCS-BR-2026-0042"
                />
              </label>
              <label className="field">
                <span className="field-label">Documento do participante</span>
                <SensitiveDocumentInput
                  name="documento"
                  required
                  autoComplete="off"
                  inputMode="text"
                  placeholder="CPF, RG ou documento informado"
                />
              </label>
              <button className="btn btn-primary" type="submit">
                Verificar documento
              </button>
            </form>
          </aside>
        </div>
      </section>
    </main>
  );
}
