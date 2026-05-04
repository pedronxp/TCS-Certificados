import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/register-form";
import { BrandLogo } from "@/components/brand-logo";
import { CertificateCarouselServer } from "@/components/certificate-carousel-server";
import { getSessionUser } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Criar conta — TCS Certificados",
  description: "Crie sua conta e comece a emitir certificados profissionais.",
};

export default async function RegisterPage() {
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
            Comece hoje mesmo.
            <br />
            <span>É gratuito e rápido.</span>
          </h2>
          <p className="auth-hero-subtitle">
            Crie sua conta em menos de um minuto e
            <br />
            emita seu primeiro certificado.
          </p>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-card animate-fade-in">
          <div className="auth-logo brand-logo-auth">
            <BrandLogo priority sizes="96px" />
          </div>

          <h1 className="auth-title">Criar conta</h1>
          <p className="auth-subtitle">
            Preencha os dados abaixo para começar.
          </p>

          <RegisterForm />

          <p className="auth-terms">
            Ao criar uma conta, você concorda com os{" "}
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
