import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { TemplateActions } from "@/components/templates/template-actions";
import { CertificateTemplatePreview, getTemplatePreviewImage } from "@/components/templates/certificate-template-preview";
import { UploadTemplateButton } from "@/components/templates/upload-template-button";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Modelos — TCS Certificados" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requireAdmin();
  const templates = await prisma.certificateTemplate.findMany({
    include: { variables: true, _count: { select: { batches: true, issues: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Modelos</h1>
          <p className="page-subtitle">Crie layouts com variáveis e QR Code de validação.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          <UploadTemplateButton />
          <Link href="/modelos/novo" className="btn btn-primary">
            + Novo modelo
          </Link>
        </div>
      </div>

      {templates.length ? (
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {templates.map((template) => (
            <article key={template.id} className="dark-card">
              <CertificateTemplatePreview
                title={template.name}
                subtitle={template.description}
                orientation={template.orientation}
                imageSrc={getTemplatePreviewImage(template)}
              />
              <Link
                href={`/modelos/${template.id}/editar`}
                style={{ display: "block", textDecoration: "none", marginTop: "1rem", marginBottom: "1rem" }}
              >
                <h2
                  style={{
                    fontWeight: 700,
                    fontSize: "0.9375rem",
                    color: "var(--text-primary)",
                    marginBottom: "0.375rem",
                    transition: "color 150ms",
                  }}
                >
                  {template.name}
                </h2>
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
                  {template.description || "Sem descrição"}
                </p>
              </Link>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1rem" }}>
                <span className="chip">{template.variables.length} variáveis</span>
                <span className="chip">{template._count.issues} emissões</span>
                <span className="chip">{template._count.batches} lotes</span>
                <span className="chip">{template.orientation}</span>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Link
                  href={`/certificados/emitir?template=${template.id}`}
                  className="btn btn-primary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    fontSize: "0.8125rem",
                    flex: 1,
                    justifyContent: "center",
                  }}
                >
                  <BadgeCheck style={{ width: 14, height: 14 }} />
                  Emitir
                </Link>
                <TemplateActions id={template.id} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            background: "var(--surface-1)",
            border: "1px dashed var(--border-muted)",
            borderRadius: "var(--radius-lg)",
            color: "var(--text-muted)",
          }}
        >
          Nenhum modelo cadastrado ainda.
        </div>
      )}
    </div>
  );
}
