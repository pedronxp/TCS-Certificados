import { BatchForm } from "@/components/certificates/batch-form";
import { requireAdmin } from "@/lib/auth";
import { failStaleBatchJobs } from "@/lib/batch-jobs";
import { BATCH_STATUS_LABELS } from "@/lib/batch-status";
import { isTemplateLayoutDisabled } from "@/lib/certificate-layout";
import { certificateOutputModeLabel } from "@/lib/certificate-output-format";
import { prisma } from "@/lib/prisma";
import type { CertificateBatchStatus } from "@prisma/client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Emissão em Lote — TCS Certificados" };
export const dynamic = "force-dynamic";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

const BATCH_STATUS: Record<CertificateBatchStatus, { label: string; cls: string }> = {
  RUNNING: { label: BATCH_STATUS_LABELS.RUNNING, cls: "chip chip-brand" },
  COMPLETED: { label: BATCH_STATUS_LABELS.COMPLETED, cls: "chip chip-success" },
  FAILED: { label: BATCH_STATUS_LABELS.FAILED, cls: "chip chip-danger" },
};

function getBatchStatusInfo(status: CertificateBatchStatus, errorCount: number) {
  if (status === "COMPLETED" && errorCount > 0) {
    return { label: "Concluído com erros", cls: "chip chip-warning" };
  }

  return BATCH_STATUS[status] ?? { label: status, cls: "chip" };
}

export default async function BatchCertificatePage() {
  await requireAdmin();
  await failStaleBatchJobs().catch((error) => {
    console.error("Falha ao encerrar lotes interrompidos", error);
  });

  const [templates, batches] = await Promise.all([
    prisma.certificateTemplate.findMany({
      select: {
        id: true,
        name: true,
        layout: true,
        variables: {
          select: { id: true, key: true, label: true, required: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }).then((items) => items.filter((template) => !isTemplateLayoutDisabled(template.layout))),
    prisma.certificateBatch.findMany({
      include: {
        template: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Emissão em lote</h1>
          <p className="page-subtitle">
            Gere vários certificados pelo modelo cadastrado, mantendo empresa e data iguais para todos.
          </p>
        </div>
      </div>

      {/* ── Batch Form ── */}
      {templates.length ? (
        <div style={{ marginBottom: "2.5rem" }}>
          <BatchForm templates={templates} />
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
            marginBottom: "2rem",
          }}
        >
          Crie um modelo antes de importar planilhas.
        </div>
      )}

      {/* ── Batch History Table ── */}
      <section className="dark-card-flat">
        <div className="dark-card-header">
          <div>
            <h2>Histórico de lotes</h2>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 2 }}>
              Acompanhe os últimos lotes gerados no sistema.
            </p>
          </div>
        </div>

        <div className="table-scroll">
          <table className="dark-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Início</th>
                <th>Modelo</th>
                <th>Empresa</th>
                <th>Data cert.</th>
                <th>Status</th>
                <th>Arquivo</th>
                <th>Progresso</th>
                <th>Erros</th>
                <th>Operador</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const errors = Array.isArray(batch.errors) ? batch.errors : [];
                const statusInfo = getBatchStatusInfo(batch.status, errors.length);
                return (
                  <tr key={batch.id}>
                    <td>{formatDateTime(batch.startedAt)}</td>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{batch.template.name}</td>
                    <td>{batch.company}</td>
                    <td>{batch.issuedDate}</td>
                    <td>
                      <span className={statusInfo.cls}>{statusInfo.label}</span>
                    </td>
                    <td>
                      <span className="chip chip-brand">{certificateOutputModeLabel(batch.outputMode)}</span>
                    </td>
                    <td>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {batch.processed}/{batch.total}
                      </span>
                      {" "}
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>({batch.created} gerados)</span>
                    </td>
                    <td>
                      {errors.length > 0 ? (
                        <span className="chip chip-danger">{errors.length}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td>{batch.createdBy.name}</td>
                  </tr>
                );
              })}
              {!batches.length && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>
                    Nenhum lote gerado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
