"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CertificateStatus } from "@prisma/client";
import { CheckSquare2, Database, FileText, LoaderCircle, Square, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/confirmation-dialog";
import { HistoryActions } from "@/components/certificates/history-actions";

export type HistoryIssue = {
  id: string;
  verificationCode: string;
  status: CertificateStatus;
  isTest: boolean;
  issuedAt: string;
  revokedAt: string | null;
  deleteAt: string | null;
  hiddenAt: string | null;
  documentExpired: boolean;
  documentAvailable: boolean;
  recipientName: string;
  recipientEmail: string | null;
  recipientDocument: string | null;
  company: string;
  templateName: string;
  issuedByName: string;
  nativeDownloadType: "docx" | "pptx";
  nativeDownloadLabel: "DOCX" | "PPTX";
};

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

export function HistoryTable({
  issues,
  canManage,
  totalResults,
  resettableCount,
  sequenceValue,
}: {
  issues: HistoryIssue[];
  canManage: boolean;
  totalResults: number;
  resettableCount: number;
  sequenceValue: number;
}) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = issues.length > 0 && issues.every((issue) => selectedSet.has(issue.id));
  const canReset = canManage && (resettableCount > 0 || sequenceValue > 0);

  function toggleIssue(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setSelectedIds((current) =>
      issues.length > 0 && issues.every((issue) => current.includes(issue.id))
        ? []
        : issues.map((issue) => issue.id),
    );
  }

  async function deleteSelected() {
    if (!selectedIds.length || bulkDeleting) return;
    const confirmed = await confirm({
      title: "Remover documentos selecionados",
      message: `Remover os arquivos de ${selectedIds.length} certificado(s)? Os códigos e a validação continuam no sistema.`,
      confirmLabel: "Remover documentos",
      tone: "danger",
    });
    if (!confirmed) return;
    setBulkDeleting(true);
    try {
      const response = await fetch("/api/certificates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.error ?? "Não foi possível remover os documentos selecionados.");
        return;
      }
      setSelectedIds([]);
      router.refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  async function resetDatabase() {
    if (!canReset || resetting) return;

    const confirmed = await confirm({
      title: "Limpar banco e resetar contagem",
      message: "Isso apaga todas as emissões, documentos gerados, lotes e destinatários sem emissões. Usuários e modelos permanecem. A próxima emissão volta para 0001.",
      confirmLabel: "Limpar banco",
      tone: "danger",
    });
    if (!confirmed) return;

    setResetting(true);
    try {
      const response = await fetch("/api/certificates/reset", { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.error ?? "Não foi possível limpar o banco.");
        return;
      }
      setSelectedIds([]);
      router.refresh();
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="history-results">
      {confirmationDialog}

      <div className="history-results-header">
        <div className="history-results-title">
          <h2>Registros</h2>
          <p>
            {selectedIds.length
              ? `${selectedIds.length} selecionado(s)`
              : `${totalResults} resultado(s) no histórico`}
          </p>
        </div>

        {canManage ? (
          <div className="history-results-actions">
            <button
              type="button"
              onClick={toggleAll}
              disabled={!issues.length}
              className="history-toolbar-button"
            >
              {allSelected
                ? <CheckSquare2 style={{ width: 15, height: 15 }} />
                : <Square style={{ width: 15, height: 15 }} />}
              {allSelected ? "Limpar seleção" : "Selecionar página"}
            </button>

            <button
              type="button"
              disabled={!selectedIds.length || bulkDeleting}
              onClick={deleteSelected}
              className="history-toolbar-button history-toolbar-danger"
            >
              {bulkDeleting
                ? <LoaderCircle className="history-spin-icon" style={{ width: 14, height: 14 }} />
                : <Trash2 style={{ width: 14, height: 14 }} />}
              Remover documentos
            </button>

            <button
              type="button"
              disabled={!canReset || resetting}
              onClick={resetDatabase}
              className="history-toolbar-button history-toolbar-reset"
            >
              {resetting
                ? <LoaderCircle className="history-spin-icon" style={{ width: 14, height: 14 }} />
                : <Database style={{ width: 14, height: 14 }} />}
              Limpar banco
            </button>
          </div>
        ) : null}
      </div>

      <div className="history-list">
        {issues.map((issue) => {
          const selected = selectedSet.has(issue.id);
          return (
            <article
              key={issue.id}
              className={`history-row${selected ? " history-row-selected" : ""}`}
            >
              <div className="history-row-main">
                <div className="history-recipient-cell">
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleIssue(issue.id)}
                      aria-label={`Selecionar ${issue.verificationCode}`}
                      className="history-row-checkbox"
                    />
                  )}
                  <span className="history-avatar">{getInitials(issue.recipientName)}</span>
                  <div className="history-recipient-copy">
                    <h3>{issue.recipientName}</h3>
                    <p>{[issue.recipientEmail, issue.recipientDocument].filter(Boolean).join(" · ") || "Sem contato"}</p>
                  </div>
                </div>

                <div className="history-status-cell">
                  {issue.isTest ? <span className="history-chip history-chip-test">Teste</span> : null}
                  <StatusBadge status={issue.status} />
                  <DocumentBadge issue={issue} />
                  {issue.revokedAt && (
                    <span className="history-status-note">Revogado em {formatDateTime(issue.revokedAt)}</span>
                  )}
                  {issue.hiddenAt && (
                    <span className="history-status-note history-status-warning">Oculto no histórico</span>
                  )}
                </div>

                <HistoryActions
                  key={`${issue.id}-${issue.deleteAt}`}
                  id={issue.id}
                  verificationCode={issue.verificationCode}
                  status={issue.status}
                  deleteAt={issue.deleteAt}
                  hiddenAt={issue.hiddenAt}
                  documentAvailable={issue.documentAvailable}
                  documentExpired={issue.documentExpired}
                  nativeDownloadType={issue.nativeDownloadType}
                  nativeDownloadLabel={issue.nativeDownloadLabel}
                  canManage={canManage}
                />
              </div>

              <div className="history-row-meta">
                <DataBlock label="Empresa" value={issue.company} />
                <DataBlock label="Modelo" value={issue.templateName} />
                <div className="history-data-block">
                  <span>Código</span>
                  <Link href={`/validar/${issue.verificationCode}`} className="history-code-link">
                    {issue.verificationCode}
                  </Link>
                </div>
                <DataBlock label="Emissão" value={formatDateTime(issue.issuedAt)} />
                <DataBlock label="Emissor" value={issue.issuedByName} />
              </div>
            </article>
          );
        })}

        {!issues.length && (
          <div className="history-empty">
            <FileText style={{ width: 32, height: 32 }} />
            <h3>Nenhum certificado encontrado</h3>
            <p>Ajuste os filtros ou emita um novo certificado para preencher o histórico.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="history-data-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: CertificateStatus }) {
  return (
    <span className={`history-chip ${status === "REVOKED" ? "history-chip-danger" : "history-chip-success"}`}>
      {status === "REVOKED" ? "Revogado" : "Emitido"}
    </span>
  );
}

function DocumentBadge({ issue }: { issue: HistoryIssue }) {
  if (issue.documentExpired) {
    return <span className="history-chip history-chip-warning">Documento expirado</span>;
  }

  if (issue.deleteAt) {
    return <span className="history-chip history-chip-brand">Expira em {formatDateOnly(issue.deleteAt)}</span>;
  }

  return <span className="history-chip history-chip-success">Documento disponível</span>;
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  return dateTimeFormatter.format(new Date(value));
}

function formatDateOnly(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const initials = `${parts[0]?.[0] ?? "?"}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`;
  return initials.toUpperCase();
}
