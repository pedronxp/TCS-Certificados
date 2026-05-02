import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/register-form";
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
      {/* ── Hero side ── */}
      <div className="auth-hero">
        <div className="auth-hero-grid" />

        {/* Carousel area */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            width: "100%",
            maxWidth: 360,
            padding: "0 1rem",
          }}
        >
          <CertificateCarouselServer />
        </div>

        {/* Bottom text */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <p
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            TCS Certificados
          </p>
          <h2
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              lineHeight: 1.2,
              color: "#ffffff",
              marginBottom: "0.75rem",
            }}
          >
            Comece hoje mesmo.
            <br />
            <span style={{ color: "rgba(255,255,255,0.8)" }}>É gratuito e rápido.</span>
          </h2>
          <p style={{ fontSize: "0.9375rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
            Crie sua conta em menos de um minuto e
            <br />
            emita seu primeiro certificado.
          </p>
        </div>
      </div>

      {/* ── Auth panel ── */}
      <div className="auth-panel">
        <div className="auth-card animate-fade-in">
          {/* Logo */}
          <div className="auth-logo" aria-hidden="true">
            TC
          </div>

          {/* Heading */}
          <h1
            style={{
              marginTop: "1.5rem",
              fontSize: "1.625rem",
              fontWeight: 800,
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            Criar conta
          </h1>
          <p
            style={{
              marginTop: "0.375rem",
              fontSize: "0.9375rem",
              color: "var(--text-secondary)",
              marginBottom: "2rem",
            }}
          >
            Preencha os dados abaixo para começar.
          </p>

          <RegisterForm />

          <p
            style={{
              marginTop: "2rem",
              textAlign: "center",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
            }}
          >
            Ao criar uma conta, você concorda com os{" "}
            <a href="#" style={{ color: "var(--brand-600)", textDecoration: "none" }}>
              Termos de Uso
            </a>{" "}
            e{" "}
            <a href="#" style={{ color: "var(--brand-600)", textDecoration: "none" }}>
              Política de Privacidade
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
