import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/brand-logo";
import { CertificateCarouselServer } from "@/components/certificate-carousel-server";
import { getSessionUser } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar — TCS Certificados",
  description: "Acesse o painel de emissão e validação de certificados.",
};

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-hero-grid" />

        <div className="auth-hero-showcase">
          <CertificateCarouselServer />
        </div>

        <div className="auth-hero-copy">
          <p className="auth-eyebrow">TCS Certificados</p>
          <h2 className="auth-hero-title">
            Emissão profissional
            <br />
            <span>de certificados digitais</span>
          </h2>
          <p className="auth-hero-subtitle">
            Crie, personalize e valide certificados com facilidade.
            <br />
            Gestão completa em um só lugar.
          </p>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card animate-fade-in">
          <div className="auth-logo brand-logo-auth">
            <BrandLogo priority sizes="96px" />
          </div>

          <h1 className="auth-title">Bem-vindo de volta</h1>
          <p className="auth-subtitle">
            Entre com sua conta para acessar o painel.
          </p>

          <LoginForm />

          <div className="auth-public-validation">
            <div className="auth-divider">
              <span>Consulta p&uacute;blica</span>
            </div>

            <Link href="/validar" className="btn btn-ghost w-full">
              <ShieldCheck className="size-4" />
              Validar certificado sem login
            </Link>
          </div>

          <p className="auth-terms">
            Ao entrar, você concorda com os{" "}
            <a href="#" className="auth-link">
              Termos de Uso
            </a>{" "}
            e{" "}
            <a href="#" className="auth-link">
              Política de Privacidade
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
