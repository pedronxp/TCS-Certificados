import Link from "next/link";
import { BadgeCheck, FileText, History, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CertificateTemplatePreview, getTemplatePreviewImage } from "@/components/templates/certificate-template-preview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — TCS Certificados",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const canManageTemplates = user.role === "ADMIN";
  const [templates, issues, users, latestIssues, recentTemplates] = await Promise.all([
    prisma.certificateTemplate.count(),
    prisma.certificateIssue.count({
      where: canManageTemplates ? undefined : { issuedById: user.id, hiddenAt: null },
    }),
    prisma.user.count(),
    prisma.certificateIssue.findMany({
      where: canManageTemplates ? { hiddenAt: null } : { hiddenAt: null, issuedById: user.id },
      take: 6,
      select: {
        id: true,
        verificationCode: true,
        issuedAt: true,
        status: true,
        recipient: { select: { name: true } },
        template: { select: { name: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.certificateTemplate.findMany({
      take: 6,
      select: {
        id: true,
        name: true,
        description: true,
        orientation: true,
        background: true,
        layout: true,
        variables: { select: { id: true } },
        _count: { select: { issues: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="page-shell page-shell-wide">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Acompanhe modelos, emissões e usuários do sistema.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          {canManageTemplates ? (
            <Link
              href="/modelos"
              className="btn btn-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Upload style={{ width: 16, height: 16 }} />
              Subir modelo
            </Link>
          ) : null}
          <Link
            href="/certificados/emitir"
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <BadgeCheck style={{ width: 16, height: 16 }} />
            Emitir certificado
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <p className="stat-label">Modelos</p>
          <p className="stat-value">{templates}</p>
          <p className="stat-helper">Layouts disponíveis para emissão</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Certificados</p>
          <p className="stat-value">{issues}</p>
          <p className="stat-helper">Emissões registradas</p>
        </div>
        {canManageTemplates ? (
          <div className="stat-card">
            <p className="stat-label">Usuários</p>
            <p className="stat-value">{users}</p>
            <p className="stat-helper">Acessos autorizados</p>
          </div>
        ) : null}
      </div>

      {/* ── Recent Templates ── */}
      <section style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2 className="section-title">Modelos recentes</h2>
            <p className="section-subtitle" style={{ marginBottom: 0 }}>
              Acesse rapidamente os modelos mais usados ou editados.
            </p>
          </div>
          {canManageTemplates ? (
            <Link
              href="/modelos"
              style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--brand-400)", textDecoration: "none" }}
            >
              Ver todos →
            </Link>
          ) : null}
        </div>

        {recentTemplates.length ? (
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {recentTemplates.map((template) => (
              <article key={template.id} className="dark-card">
                <CertificateTemplatePreview
                  title={template.name}
                  subtitle={template.description}
                  orientation={template.orientation}
                  imageSrc={getTemplatePreviewImage(template)}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    marginTop: "1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: "0.9375rem",
                        color: "var(--text-primary)",
                        marginBottom: "0.375rem",
                      }}
                    >
                      {template.name}
                    </h3>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {template.description || "Modelo sem descrição."}
                    </p>
                  </div>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "rgba(99,102,241,0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FileText style={{ width: 16, height: 16, color: "var(--brand-400)" }} />
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1rem" }}>
                  <span className="chip">{template.variables.length} campos</span>
                  <span className="chip">{template._count.issues} emissões</span>
                  <span className="chip">{template.orientation}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: canManageTemplates ? "1fr 1fr" : "1fr",
                    gap: "0.5rem",
                  }}
                >
                  {canManageTemplates ? (
                    <Link
                      href={`/modelos/${template.id}/editar`}
                      className="btn btn-ghost"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", fontSize: "0.8125rem" }}
                    >
                      Editar
                    </Link>
                  ) : null}
                  <Link
                    href={`/certificados/emitir?template=${template.id}`}
                    className="btn btn-primary"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.375rem", fontSize: "0.8125rem" }}
                  >
                    <BadgeCheck style={{ width: 14, height: 14 }} />
                    Emitir
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              background: "var(--surface-1)",
              border: "1px dashed var(--border-muted)",
              borderRadius: "var(--radius-lg)",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
            }}
          >
            Nenhum modelo cadastrado ainda. Use &quot;Subir modelo&quot; para começar.
          </div>
        )}
      </section>

      {/* ── Latest Issues ── */}
      <section>
        <div className="dark-card-flat">
          <div className="dark-card-header">
            <h2>Últimas emissões</h2>
            <Link
              href="/certificados/historico"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--brand-400)",
                textDecoration: "none",
              }}
            >
              <History style={{ width: 14, height: 14 }} />
              Histórico
            </Link>
          </div>

          {latestIssues.length ? (
            <div>
              {latestIssues.map((issue) => (
                <div key={issue.id} className="dark-list-row">
                  <div>
                    <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                      {issue.recipient.name}
                    </p>
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 2 }}>
                      {issue.template.name} · {issue.verificationCode}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span
                      className={`chip ${issue.status === "ISSUED" ? "chip-success" : "chip-danger"}`}
                    >
                      {issue.status === "ISSUED" ? "Emitido" : "Revogado"}
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                      {issue.issuedAt.toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ padding: "1.5rem", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              Nenhum certificado emitido ainda.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
