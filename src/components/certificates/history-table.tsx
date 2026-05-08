"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CertificateStatus } from "@prisma/client";
import { CheckSquare2, LoaderCircle, Square, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/confirmation-dialog";
import { HistoryActions } from "@/components/certificates/history-actions";

export type HistoryIssue = {
  id: string;
  verificationCode: string;
  status: CertificateStatus;
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
}: {
  issues: HistoryIssue[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = issues.length > 0 && issues.every((issue) => selectedSet.has(issue.id));

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
      message: `Remover os arquivos de ${selectedIds.length} certificado(s)? Os codigos e a validacao continuam no sistema.`,
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
        alert(result?.error ?? "Nao foi possivel remover os documentos selecionados.");
        return;
      }
      setSelectedIds([]);
      router.refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <section
      style={{
        marginTop: "1rem",
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
        overflow: "hidden",
      }}
    >
      {confirmationDialog}

      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.875rem 1.25rem",
          borderBottom: "1px solid var(--border-subtle)",
          minHeight: 56,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {canManage && (
            <button
              type="button"
              onClick={toggleAll}
              disabled={!issues.length}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.375rem 0.875rem",
                background: "var(--surface-2)",
                border: "1px solid var(--border-muted)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border-muted)"; }}
            >
              {allSelected
                ? <CheckSquare2 style={{ width: 15, height: 15 }} />
                : <Square style={{ width: 15, height: 15 }} />}
              {allSelected ? "Limpar seleção" : "Selecionar página"}
            </button>
          )}
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", fontWeight: 500 }}>
            {selectedIds.length
              ? `${selectedIds.length} selecionado(s)`
              : `${issues.length} registro(s)`}
          </span>
        </div>

        {canManage && (
          <button
            type="button"
            disabled={!selectedIds.length || bulkDeleting}
            onClick={deleteSelected}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              height: 36,
              padding: "0 1rem",
              background: selectedIds.length ? "rgba(239,68,68,0.15)" : "var(--surface-2)",
              border: `1px solid ${selectedIds.length ? "rgba(239,68,68,0.35)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: selectedIds.length ? "#fca5a5" : "var(--text-muted)",
              cursor: selectedIds.length ? "pointer" : "not-allowed",
              opacity: !selectedIds.length || bulkDeleting ? 0.5 : 1,
              transition: "all 150ms",
            }}
          >
            {bulkDeleting
              ? <LoaderCircle style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              : <Trash2 style={{ width: 14, height: 14 }} />}
            Remover documentos
          </button>
        )}
      </div>

      {/* ── Rows ── */}
      <div>
        {issues.map((issue) => {
          const selected = selectedSet.has(issue.id);
          return (
            <article
              key={issue.id}
              style={{
                padding: "1.125rem 1.25rem",
                borderBottom: "1px solid var(--border-subtle)",
                background: selected
                  ? "rgba(99,102,241,0.06)"
                  : "transparent",
                transition: "background 150ms",
              }}
            >
              {/* Row header */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                {/* Left: checkbox + name */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleIssue(issue.id)}
                      aria-label={`Selecionar ${issue.verificationCode}`}
                      style={{
                        marginTop: 3,
                        width: 15,
                        height: 15,
                        flexShrink: 0,
                        accentColor: "var(--brand-500)",
                        cursor: "pointer",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                      {issue.recipientName}
                    </p>
                    <p style={{ marginTop: 3, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {[issue.recipientEmail, issue.recipientDocument].filter(Boolean).join(" · ") || "Sem contato"}
                    </p>
                  </div>
                </div>

                {/* Center: status */}
                <div style={{ minWidth: 150, flexShrink: 0 }}>
                  <StatusBadge status={issue.status} />
                  <DocumentBadge issue={issue} />
                  {issue.revokedAt && (
                    <p style={{ marginTop: 4, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      em {formatDateTime(issue.revokedAt)}
                    </p>
                  )}
                  {issue.hiddenAt && (
                    <p style={{ marginTop: 4, fontSize: "0.75rem", color: "#fcd34d" }}>Oculto</p>
                  )}
                </div>

                {/* Right: actions */}
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

              {/* Data strip */}
              <div
                style={{
                  marginTop: "0.875rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1rem 2rem",
                  padding: "0.75rem 1rem",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <DataBlock label="Empresa" value={issue.company} />
                <DataBlock label="Modelo" value={issue.templateName} />
                <div style={{ flex: 1, minWidth: 120 }}>
                  <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Código
                  </p>
                  <Link
                    href={`/validar/${issue.verificationCode}`}
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "var(--brand-400)",
                      textDecoration: "none",
                      letterSpacing: "0.04em",
                    }}
                  >
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
          <div
            style={{
              padding: "3rem",
              textAlign: "center",
              fontSize: "0.9rem",
              color: "var(--text-muted)",
            }}
          >
            Nenhum certificado encontrado com os filtros atuais.
          </div>
        )}
      </div>
    </section>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ marginTop: 4, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.4, wordBreak: "break-word" }}>
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: CertificateStatus }) {
  if (status === "REVOKED") {
    return (
      <span
        style={{
          display: "inline-flex",
          padding: "0.2rem 0.65rem",
          borderRadius: 99,
          fontSize: "0.75rem",
          fontWeight: 700,
          background: "rgba(239,68,68,0.12)",
          color: "#fca5a5",
          border: "1px solid rgba(239,68,68,0.25)",
        }}
      >
        Revogado
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "0.2rem 0.65rem",
        borderRadius: 99,
        fontSize: "0.75rem",
        fontWeight: 700,
        background: "rgba(34,197,94,0.12)",
        color: "#86efac",
        border: "1px solid rgba(34,197,94,0.25)",
      }}
    >
      Emitido
    </span>
  );
}

function DocumentBadge({ issue }: { issue: HistoryIssue }) {
  if (issue.documentExpired) {
    return (
      <span style={badgeStyle("rgba(245,158,11,0.12)", "#fcd34d", "rgba(245,158,11,0.25)")}>
        Documento expirado
      </span>
    );
  }

  if (issue.deleteAt) {
    return (
      <span style={badgeStyle("rgba(99,102,241,0.12)", "var(--brand-400)", "rgba(99,102,241,0.25)")}>
        Expira em {formatDateOnly(issue.deleteAt)}
      </span>
    );
  }

  return (
    <span style={badgeStyle("rgba(34,197,94,0.12)", "#86efac", "rgba(34,197,94,0.25)")}>
      Documento disponivel
    </span>
  );
}

function badgeStyle(background: string, color: string, border: string): React.CSSProperties {
  return {
    display: "inline-flex",
    marginTop: 5,
    padding: "0.2rem 0.65rem",
    borderRadius: 99,
    fontSize: "0.75rem",
    fontWeight: 700,
    background,
    color,
    border: `1px solid ${border}`,
  };
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  return dateTimeFormatter.format(new Date(value));
}

function formatDateOnly(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}
