import Link from "next/link";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  Layers3,
  ListChecks,
  ShieldAlert,
  Upload,
  Users,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { BATCH_STATUS_LABELS } from "@/lib/batch-status";
import { certificateOutputModeLabel } from "@/lib/certificate-output-format";
import { prisma } from "@/lib/prisma";
import type { CertificateBatchStatus } from "@prisma/client";
import type { Metadata } from "next";
import type { ComponentType, CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Dashboard operacional - TCS Certificados",
};

export const dynamic = "force-dynamic";

const BATCH_STATUS_STYLES: Record<CertificateBatchStatus, string> = {
  RUNNING: "chip chip-brand",
  COMPLETED: "chip chip-success",
  FAILED: "chip chip-danger",
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

function getBatchStatusInfo(status: CertificateBatchStatus, errorCount: number) {
  if (status === "COMPLETED" && errorCount > 0) {
    return { label: "Concluído com erros", cls: "chip chip-warning" };
  }

  return {
    label: BATCH_STATUS_LABELS[status],
    cls: BATCH_STATUS_STYLES[status],
  };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const canManageOperation = user.role === "ADMIN";
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const issueScopeWhere = canManageOperation
    ? { hiddenAt: null }
    : { hiddenAt: null, issuedById: user.id };
  const batchScopeWhere = canManageOperation ? {} : { createdById: user.id };

  const [
    templateCount,
    totalIssues,
    todayIssues,
    recentIssues,
    recentOfficialIssues,
    recentTestIssues,
    revokedRecentIssues,
    activeUsers,
    recentBatchCount,
    runningBatchCount,
    failedRecentBatchCount,
    latestIssues,
    recentBatches,
    mostUsedGroups,
  ] = await Promise.all([
    prisma.certificateTemplate.count(),
    prisma.certificateIssue.count({ where: issueScopeWhere }),
    prisma.certificateIssue.count({
      where: { ...issueScopeWhere, issuedAt: { gte: startOfToday } },
    }),
    prisma.certificateIssue.count({
      where: { ...issueScopeWhere, issuedAt: { gte: sevenDaysAgo } },
    }),
    prisma.certificateIssue.count({
      where: { ...issueScopeWhere, issuedAt: { gte: sevenDaysAgo }, isTest: false },
    }),
    prisma.certificateIssue.count({
      where: { ...issueScopeWhere, issuedAt: { gte: sevenDaysAgo }, isTest: true },
    }),
    prisma.certificateIssue.count({
      where: { ...issueScopeWhere, status: "REVOKED", revokedAt: { gte: sevenDaysAgo } },
    }),
    canManageOperation ? prisma.user.count() : Promise.resolve(null),
    prisma.certificateBatch.count({
      where: { ...batchScopeWhere, startedAt: { gte: sevenDaysAgo } },
    }),
    prisma.certificateBatch.count({
      where: { ...batchScopeWhere, status: "RUNNING" },
    }),
    prisma.certificateBatch.count({
      where: { ...batchScopeWhere, status: "FAILED", startedAt: { gte: sevenDaysAgo } },
    }),
    prisma.certificateIssue.findMany({
      where: issueScopeWhere,
      take: 8,
      select: {
        id: true,
        verificationCode: true,
        issuedAt: true,
        status: true,
        isTest: true,
        outputMode: true,
        recipient: { select: { name: true } },
        template: { select: { name: true } },
        issuedBy: { select: { name: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.certificateBatch.findMany({
      where: batchScopeWhere,
      take: 6,
      select: {
        id: true,
        status: true,
        total: true,
        processed: true,
        created: true,
        errors: true,
        company: true,
        outputMode: true,
        startedAt: true,
        template: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.certificateIssue.groupBy({
      by: ["templateId"],
      where: issueScopeWhere,
      _count: { templateId: true },
      orderBy: { _count: { templateId: "desc" } },
      take: 5,
    }),
  ]);

  const mostUsedTemplateIds = mostUsedGroups.map((group) => group.templateId);
  const mostUsedTemplates = mostUsedTemplateIds.length
    ? await prisma.certificateTemplate.findMany({
        where: { id: { in: mostUsedTemplateIds } },
        select: {
          id: true,
          name: true,
          description: true,
          orientation: true,
          _count: { select: { variables: true } },
        },
      })
    : [];
  const mostUsedTemplateById = new Map(mostUsedTemplates.map((template) => [template.id, template]));
  const mostUsed = mostUsedGroups.flatMap((group) => {
    const template = mostUsedTemplateById.get(group.templateId);
    return template ? [{ template, total: group._count.templateId }] : [];
  });

  const recentIssueRate = totalIssues > 0 ? recentIssues / totalIssues : 0;
  const alertItems = [
    {
      key: "running-batches",
      icon: Clock3,
      severity: runningBatchCount > 0 ? "warning" : "success",
      title: "Lotes em andamento",
      value: runningBatchCount,
      detail: runningBatchCount > 0 ? "Processamento ativo agora" : "Fila de lotes livre",
    },
    {
      key: "failed-batches",
      icon: AlertTriangle,
      severity: failedRecentBatchCount > 0 ? "danger" : "success",
      title: "Falhas em lote",
      value: failedRecentBatchCount,
      detail: "Ocorrências nos últimos 7 dias",
    },
    {
      key: "revoked-issues",
      icon: ShieldAlert,
      severity: revokedRecentIssues > 0 ? "warning" : "success",
      title: "Revogações recentes",
      value: revokedRecentIssues,
      detail: "Certificados revogados nos últimos 7 dias",
    },
    {
      key: "templates",
      icon: Layers3,
      severity: templateCount > 0 ? "success" : "danger",
      title: "Modelos disponíveis",
      value: templateCount,
      detail: templateCount > 0 ? "Base pronta para emissão" : "Nenhum modelo cadastrado",
    },
  ];

  return (
    <div className="page-shell page-shell-wide operational-dashboard">
      <div className="page-header operational-header">
        <div>
          <span className="operational-eyebrow">Painel operacional</span>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Métricas de emissão, produção recente, lotes e sinais de atenção em tempo real.
          </p>
        </div>
        <div className="operational-actions">
          <Link href="/certificados/emitir" className="btn btn-primary">
            <BadgeCheck style={{ width: 16, height: 16 }} />
            Emitir certificado
          </Link>
          {canManageOperation ? (
            <Link href="/certificados/lote" className="btn btn-ghost">
              <Upload style={{ width: 16, height: 16 }} />
              Emitir em lote
            </Link>
          ) : null}
          {canManageOperation ? (
            <Link href="/modelos" className="btn btn-ghost">
              <Layers3 style={{ width: 16, height: 16 }} />
              Modelos
            </Link>
          ) : null}
        </div>
      </div>

      <section className="operational-metrics" aria-label="Métricas principais">
        <MetricCard
          icon={FileText}
          label="Certificados"
          value={totalIssues}
          helper="Emissões visíveis no escopo atual"
        />
        <MetricCard icon={BadgeCheck} label="Hoje" value={todayIssues} helper="Certificados emitidos desde 00:00" />
        <MetricCard icon={BarChart3} label="Últimos 7 dias" value={recentIssues} helper="Produção recente consolidada" />
        <MetricCard icon={Layers3} label="Modelos" value={templateCount} helper="Layouts disponíveis para emissão" />
        {canManageOperation && activeUsers !== null ? (
          <MetricCard icon={Users} label="Usuários" value={activeUsers} helper="Acessos cadastrados no sistema" />
        ) : null}
      </section>

      <div className="operational-main-grid">
        <section className="dark-card-flat operational-panel">
          <div className="dark-card-header">
            <div>
              <h2>Produção recente</h2>
              <p className="operational-panel-subtitle">Movimento dos últimos 7 dias.</p>
            </div>
            <span className="chip chip-brand">{formatPercent(recentIssueRate)} do total</span>
          </div>
          <div className="operational-production-grid">
            <ProductionItem label="Emitidos" value={recentIssues} helper="Total no período" />
            <ProductionItem label="Oficiais" value={recentOfficialIssues} helper="Sem marcação de teste" />
            <ProductionItem label="Testes" value={recentTestIssues} helper="Emissões de conferência" />
            <ProductionItem label="Lotes" value={recentBatchCount} helper="Criados no período" />
          </div>
        </section>

        <section className="dark-card-flat operational-panel">
          <div className="dark-card-header">
            <div>
              <h2>Alertas</h2>
              <p className="operational-panel-subtitle">Sinais operacionais que merecem acompanhamento.</p>
            </div>
          </div>
          <div className="operational-alert-list">
            {alertItems.map((alert) => {
              const Icon = alert.icon;
              return (
                <article key={alert.key} className={`operational-alert operational-alert-${alert.severity}`}>
                  <span className="operational-alert-icon" aria-hidden="true">
                    <Icon style={{ width: 17, height: 17 }} />
                  </span>
                  <div>
                    <p>{alert.title}</p>
                    <span>{alert.detail}</span>
                  </div>
                  <strong>{alert.value}</strong>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="operational-main-grid">
        <section className="dark-card-flat operational-panel">
          <div className="dark-card-header">
            <div>
              <h2>Lotes recentes</h2>
              <p className="operational-panel-subtitle">Últimos processamentos registrados.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="dark-table operational-table">
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Modelo</th>
                  <th>Empresa</th>
                  <th>Status</th>
                  <th>Progresso</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((batch) => {
                  const errors = Array.isArray(batch.errors) ? batch.errors : [];
                  const statusInfo = getBatchStatusInfo(batch.status, errors.length);
                  return (
                    <tr key={batch.id}>
                      <td>{formatDateTime(batch.startedAt)}</td>
                      <td>
                        <span className="operational-table-title">{batch.template.name}</span>
                        <span className="operational-table-meta">{certificateOutputModeLabel(batch.outputMode)}</span>
                      </td>
                      <td>{batch.company}</td>
                      <td>
                        <span className={statusInfo.cls}>{statusInfo.label}</span>
                      </td>
                      <td>
                        <span className="operational-table-title">
                          {batch.processed}/{batch.total}
                        </span>
                        <span className="operational-table-meta">
                          {batch.created} gerados por {batch.createdBy.name}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!recentBatches.length ? (
                  <tr>
                    <td colSpan={5} className="operational-empty">
                      Nenhum lote recente.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dark-card-flat operational-panel">
          <div className="dark-card-header">
            <div>
              <h2>Modelos mais usados</h2>
              <p className="operational-panel-subtitle">Ranking por emissões visíveis no escopo atual.</p>
            </div>
          </div>
          <div className="operational-ranking">
            {mostUsed.map((item, index) => (
              <article key={item.template.id} className="operational-ranking-row">
                <span className="operational-rank">{index + 1}</span>
                <div>
                  <p>{item.template.name}</p>
                  <span>
                    {item.template._count.variables} campos · {item.template.orientation}
                  </span>
                </div>
                <strong>{item.total}</strong>
              </article>
            ))}
            {!mostUsed.length ? (
              <div className="operational-empty operational-empty-block">Nenhum modelo usado em emissão ainda.</div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="dark-card-flat operational-panel">
        <div className="dark-card-header">
          <div>
            <h2>Últimas emissões</h2>
            <p className="operational-panel-subtitle">Eventos mais recentes de certificados emitidos ou revogados.</p>
          </div>
          <span className="chip">{latestIssues.length} registros</span>
        </div>
        <div className="operational-issue-list">
          {latestIssues.map((issue) => (
            <article key={issue.id} className="operational-issue-row">
              <span className="operational-issue-icon" aria-hidden="true">
                <ListChecks style={{ width: 17, height: 17 }} />
              </span>
              <div>
                <p>{issue.recipient.name}</p>
                <span>
                  {issue.template.name} · {issue.verificationCode}
                </span>
              </div>
              <div className="operational-issue-meta">
                <span className={`chip ${issue.status === "ISSUED" ? "chip-success" : "chip-danger"}`}>
                  {issue.status === "ISSUED" ? "Emitido" : "Revogado"}
                </span>
                {issue.isTest ? <span className="chip chip-warning">Teste</span> : null}
                <span className="chip chip-brand">{certificateOutputModeLabel(issue.outputMode)}</span>
                <span>{formatDate(issue.issuedAt)}</span>
                <span>{issue.issuedBy.name}</span>
              </div>
            </article>
          ))}
          {!latestIssues.length ? (
            <div className="operational-empty operational-empty-block">Nenhum certificado emitido ainda.</div>
          ) : null}
        </div>
      </section>

      <footer className="operational-footer">
        <CheckCircle2 style={{ width: 16, height: 16 }} />
        <span>Dados atualizados a cada carregamento do painel.</span>
      </footer>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: ComponentType<{ style?: CSSProperties }>;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <article className="stat-card operational-metric-card">
      <span className="operational-metric-icon" aria-hidden="true">
        <Icon style={{ width: 18, height: 18 }} />
      </span>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-helper">{helper}</p>
    </article>
  );
}

function ProductionItem({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <article className="operational-production-item">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </article>
  );
}
