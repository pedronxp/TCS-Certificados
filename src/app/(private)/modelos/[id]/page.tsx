import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Pencil } from "lucide-react";
import {
  CertificateTemplatePreview,
  getTemplatePreviewImage,
} from "@/components/templates/certificate-template-preview";
import {
  getTemplateLayoutDisabledReason,
  getTemplateLayoutMaintenanceReason,
  isTemplateLayoutDisabled,
  isTemplateLayoutMaintenance,
  normalizeVisualDocxLayout,
  templateLayoutSchema,
} from "@/lib/certificate-layout";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTemplateVariableRequired } from "@/lib/template-variable-fields";

export const dynamic = "force-dynamic";

export default async function ViewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const template = await prisma.certificateTemplate.findUnique({
    where: { id },
    include: {
      variables: { orderBy: { createdAt: "asc" } },
      _count: { select: { batches: true, issues: true } },
    },
  });

  if (!template) notFound();

  const layout = normalizeVisualDocxLayout(templateLayoutSchema.parse(template.layout));
  const disabled = isTemplateLayoutDisabled(template.layout);
  const disabledReason = getTemplateLayoutDisabledReason(template.layout);
  const maintenance = isTemplateLayoutMaintenance(template.layout);
  const maintenanceReason = getTemplateLayoutMaintenanceReason(template.layout);
  const imageSrc = getTemplatePreviewImage({
    background: template.background,
    layout,
  });

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <Link href="/modelos" className="btn btn-ghost" style={{ marginBottom: "0.875rem" }}>
            Voltar
          </Link>
          <h1 className="page-title">{template.name}</h1>
          <p className="page-subtitle">{template.description || "Modelo sem descrição."}</p>
          {disabled ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}>
              <span className="chip chip-danger">Desativado</span>
              {disabledReason ? (
                <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{disabledReason}</span>
              ) : null}
            </div>
          ) : null}
          {maintenance ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}>
              <span className="chip chip-warning">Manutenção</span>
              {maintenanceReason ? (
                <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>{maintenanceReason}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          <Link href={`/modelos/${template.id}/editar`} className="btn btn-ghost">
            <Pencil style={{ width: 16, height: 16 }} />
            Editar modelo
          </Link>
          {disabled ? (
            <span className="btn btn-ghost" aria-disabled="true" style={{ opacity: 0.65, cursor: "not-allowed" }}>
              <BadgeCheck style={{ width: 16, height: 16 }} />
              Desativado
            </span>
          ) : (
            <Link href={`/certificados/emitir?template=${template.id}`} className="btn btn-primary">
              <BadgeCheck style={{ width: 16, height: 16 }} />
              Emitir
            </Link>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
          gap: "1rem",
        }}
      >
        <section className="dark-card" aria-label="Prévia do modelo">
          <CertificateTemplatePreview
            title={template.name}
            subtitle={template.description}
            orientation={template.orientation}
            imageSrc={imageSrc}
          />
        </section>

        <aside className="dark-card" style={{ display: "grid", alignContent: "start", gap: "1rem" }}>
          <div>
            <h2 className="section-title">Detalhes</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.75rem" }}>
              <span className="chip">{template.variables.length} variáveis</span>
              {disabled ? <span className="chip chip-danger">Desativado</span> : null}
              {maintenance ? <span className="chip chip-warning">Manutenção</span> : null}
              <span className="chip">{template._count.issues} emissões</span>
              <span className="chip">{template._count.batches} lotes</span>
              <span className="chip">{template.orientation}</span>
              <span className="chip">
                {template.width} x {template.height}
              </span>
            </div>
          </div>

          <div>
            <h2 className="section-title">Arquivo base</h2>
            <p className="section-subtitle" style={{ marginBottom: 0 }}>
              {layout.baseFileName || "Sem arquivo base vinculado."}
            </p>
          </div>

          <div>
            <h2 className="section-title">Campos do modelo</h2>
            {template.variables.length ? (
              <div className="table-scroll" style={{ marginTop: "0.75rem" }}>
                <table className="dark-table">
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Obrigatório</th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.variables.map((variable) => (
                      <tr key={variable.id}>
                        <td>
                          <strong style={{ color: "var(--text-primary)" }}>{variable.label}</strong>
                          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            {`{{${variable.key}}}`}
                          </div>
                        </td>
                        <td>{isTemplateVariableRequired(variable) ? "Sim" : "Não"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="section-subtitle" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                Nenhum campo configurado.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
