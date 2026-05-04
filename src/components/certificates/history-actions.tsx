"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CertificateStatus } from "@prisma/client";
import { Ban, CalendarCheck2, Eye, EyeOff, FileDown, LoaderCircle, MessageCircle, ShieldCheck, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/confirmation-dialog";

type PendingAction = "download-pdf" | "download-docx" | "revoke" | "expire" | "schedule" | "clear" | "hide" | null;
type DownloadType = "pdf" | "docx";

const scheduleDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export function HistoryActions({
  id,
  verificationCode,
  status,
  deleteAt,
  hiddenAt,
  documentAvailable,
  documentExpired,
  canManage,
}: {
  id: string;
  verificationCode: string;
  status: CertificateStatus;
  deleteAt: string | null;
  hiddenAt: string | null;
  documentAvailable: boolean;
  documentExpired: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [savedDate, setSavedDate] = useState(deleteAt ?? "");
  const [scheduledDate, setScheduledDate] = useState(deleteAt ?? "");
  const [scheduleVisible, setScheduleVisible] = useState(Boolean(deleteAt));
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const disabled = !canManage || Boolean(pendingAction);
  const expireDisabled = disabled || documentExpired;
  const downloadDisabled = Boolean(pendingAction) || !documentAvailable;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const validationUrl = `${appUrl}/validar/${verificationCode}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Confira a validação do certificado: ${validationUrl}`)}`;

  async function downloadFile(type: DownloadType) {
    if (pendingAction || !documentAvailable || documentExpired) return;

    setPendingAction(type === "pdf" ? "download-pdf" : "download-docx");
    try {
      const res = await fetch(`/api/certificates/${id}/download/${type}`);
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        alert(result?.error ?? "Não foi possível baixar o arquivo agora.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = getDownloadFilename(res.headers.get("Content-Disposition")) ?? `certificado.${type}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Falha ao baixar certificado", error);
      alert("Não foi possível baixar o arquivo agora.");
    } finally {
      setPendingAction(null);
    }
  }

  async function revoke() {
    const confirmed = await confirm({
      title: "Revogar certificado",
      message: "A página pública continuará abrindo, mas passará a mostrar o status revogado.",
      confirmLabel: "Revogar",
      tone: "danger",
    });
    if (!confirmed) return;
    setPendingAction("revoke");
    try {
      const res = await fetch(`/api/certificates/${id}/revoke`, { method: "POST" });
      if (!res.ok) { alert("Não foi possível revogar o certificado."); return; }
      router.refresh();
    } finally { setPendingAction(null); }
  }

  async function saveSchedule(nextDate = scheduledDate, action: PendingAction = "schedule") {
    const confirmed = await confirm({
      title: nextDate ? "Programar expiracao" : "Limpar expiracao programada",
      message: nextDate
        ? `Os arquivos PDF/DOCX deste certificado serao removidos em ${formatScheduleDate(nextDate)}. O codigo e a validacao continuam salvos.`
        : "A data de expiracao automatica sera removida.",
      confirmLabel: nextDate ? "Programar" : "Limpar programacao",
      tone: nextDate ? "danger" : "default",
    });
    if (!confirmed) return;
    setPendingAction(action);
    try {
      const res = await fetch(`/api/certificates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAt: nextDate || null }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        alert(result?.error ?? "Não foi possível salvar o prazo."); return;
      }
      setSavedDate(nextDate);
      setScheduledDate(nextDate);
      router.refresh();
    } finally { setPendingAction(null); }
  }

  async function expireNow() {
    const confirmed = await confirm({
      title: "Remover documentos",
      message: "Os arquivos PDF/DOCX serao removidos agora. O certificado, o codigo e a validacao continuam no sistema.",
      confirmLabel: "Remover documentos",
      tone: "danger",
    });
    if (!confirmed) return;
    setPendingAction("expire");
    try {
      const res = await fetch(`/api/certificates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        alert(result?.error ?? "Nao foi possivel remover os documentos."); return;
      }
      router.refresh();
    } finally { setPendingAction(null); }
  }

  async function toggleHidden() {
    const nextHidden = !hiddenAt;
    const confirmed = await confirm({
      title: nextHidden ? "Sumir do histórico" : "Reexibir no histórico",
      message: nextHidden
        ? "O certificado ficará salvo, mas sai da lista padrão."
        : "O certificado voltará a aparecer na lista padrão.",
      confirmLabel: nextHidden ? "Sumir" : "Reexibir",
    });
    if (!confirmed) return;
    setPendingAction("hide");
    try {
      const res = await fetch(`/api/certificates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        alert(result?.error ?? "Não foi possível atualizar a visibilidade."); return;
      }
      router.refresh();
    } finally { setPendingAction(null); }
  }

  const iconBtn = (
    bg: string,
    color: string,
    hoverBg: string,
    extra?: React.CSSProperties,
  ): React.CSSProperties => ({
    display: "inline-grid",
    width: 34,
    height: 34,
    placeItems: "center",
    flexShrink: 0,
    borderRadius: "var(--radius-sm)",
    background: bg,
    color,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "background 150ms",
    ...extra,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
      {confirmationDialog}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", justifyContent: "flex-end" }}>
        {/* PDF */}
        <button
          type="button"
          onClick={() => downloadFile("pdf")}
          disabled={downloadDisabled}
          title={documentAvailable ? "Baixar PDF" : "Documento expirado"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            height: 34,
            padding: "0 0.75rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-muted)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            cursor: downloadDisabled ? "not-allowed" : "pointer",
            opacity: downloadDisabled && pendingAction !== "download-pdf" ? 0.45 : 1,
            transition: "all 150ms",
          }}
        >
          {pendingAction === "download-pdf"
            ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            : <FileDown style={{ width: 13, height: 13 }} />} PDF
        </button>

        {/* DOCX */}
        <button
          type="button"
          onClick={() => downloadFile("docx")}
          disabled={downloadDisabled}
          title={documentAvailable ? "Baixar DOCX" : "Documento expirado"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            height: 34,
            padding: "0 0.75rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-muted)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            cursor: downloadDisabled ? "not-allowed" : "pointer",
            opacity: downloadDisabled && pendingAction !== "download-docx" ? 0.45 : 1,
            transition: "all 150ms",
          }}
        >
          {pendingAction === "download-docx"
            ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            : <FileDown style={{ width: 13, height: 13 }} />} DOCX
        </button>

        <a
          href={`/validar/${verificationCode}`}
          title="Abrir validação"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            height: 34,
            padding: "0 0.75rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-muted)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
        >
          <ShieldCheck style={{ width: 13, height: 13 }} /> Validar
        </a>

        <a
          href={whatsappUrl}
          title="Compartilhar pelo WhatsApp"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            height: 34,
            padding: "0 0.75rem",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border-muted)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
        >
          <MessageCircle style={{ width: 13, height: 13 }} /> WhatsApp
        </a>

        {canManage ? (
          <>
        {/* Revoke */}
        <button
          type="button"
          disabled={disabled || status === "REVOKED"}
          onClick={revoke}
          title={canManage ? "Revogar certificado" : "Apenas administradores"}
          style={iconBtn("rgba(239,68,68,0.1)", "#fca5a5", "rgba(239,68,68,0.2)")}
        >
          {pendingAction === "revoke"
            ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            : <Ban style={{ width: 13, height: 13 }} />}
        </button>

        {/* Hide / Unhide */}
        <button
          type="button"
          disabled={disabled}
          onClick={toggleHidden}
          title={canManage ? (hiddenAt ? "Reexibir" : "Ocultar") : "Apenas administradores"}
          style={iconBtn("rgba(251,191,36,0.1)", "#fcd34d", "rgba(251,191,36,0.2)")}
        >
          {pendingAction === "hide"
            ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            : hiddenAt
              ? <Eye style={{ width: 13, height: 13 }} />
              : <EyeOff style={{ width: 13, height: 13 }} />}
        </button>

        {/* Schedule toggle */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setScheduleVisible((v) => !v)}
          title={scheduleVisible ? "Esconder programacao" : "Programar expiracao"}
          style={iconBtn(
            scheduleVisible || savedDate ? "rgba(99,102,241,0.15)" : "var(--surface-2)",
            scheduleVisible || savedDate ? "var(--brand-400)" : "var(--text-muted)",
            "rgba(99,102,241,0.25)",
            { border: `1px solid ${scheduleVisible || savedDate ? "rgba(99,102,241,0.3)" : "var(--border-subtle)"}` },
          )}
        >
          <CalendarCheck2 style={{ width: 13, height: 13 }} />
        </button>

        {/* Expire documents */}
        <button
          type="button"
          disabled={expireDisabled}
          onClick={expireNow}
          title={canManage ? (documentExpired ? "Documentos ja expirados" : "Remover documentos agora") : "Apenas administradores"}
          style={iconBtn("rgba(239,68,68,0.15)", "#fca5a5", "rgba(239,68,68,0.25)", {
            border: "1px solid rgba(239,68,68,0.25)",
            cursor: expireDisabled ? "not-allowed" : "pointer",
            opacity: expireDisabled ? 0.45 : 1,
          })}
        >
          {pendingAction === "expire"
            ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
            : <Trash2 style={{ width: 13, height: 13 }} />}
        </button>
          </>
        ) : null}
      </div>

      {/* Schedule panel */}
      {canManage && scheduleVisible && (
        <div
          style={{
            padding: "0.625rem 0.875rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border-muted)",
            borderRadius: "var(--radius-sm)",
            minWidth: 240,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              Expiracao programada
            </p>
            <button
              type="button"
              onClick={() => setScheduleVisible(false)}
              style={{
                display: "inline-grid",
                width: 24,
                height: 24,
                placeItems: "center",
                borderRadius: 4,
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <EyeOff style={{ width: 12, height: 12 }} />
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <input
              type="date"
              value={scheduledDate}
              disabled={disabled}
              onChange={(e) => setScheduledDate(e.target.value)}
              aria-label="Data de expiracao automatica"
              style={{
                flex: 1,
                height: 34,
                padding: "0 0.75rem",
                background: "var(--surface-1)",
                border: "1px solid var(--border-muted)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: "0.8125rem",
                outline: "none",
              }}
            />
            <button
              type="button"
              disabled={disabled || scheduledDate === savedDate}
              onClick={() => saveSchedule()}
              title="Salvar data"
              style={{
                display: "inline-grid",
                width: 34,
                height: 34,
                placeItems: "center",
                background: "var(--surface-1)",
                border: "1px solid var(--border-muted)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {pendingAction === "schedule"
                ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                : <CalendarCheck2 style={{ width: 13, height: 13 }} />}
            </button>
            <button
              type="button"
              disabled={disabled || !savedDate}
              onClick={() => saveSchedule("", "clear")}
              title="Limpar data"
              style={{
                display: "inline-grid",
                width: 34,
                height: 34,
                placeItems: "center",
                background: "var(--surface-1)",
                border: "1px solid var(--border-muted)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {pendingAction === "clear"
                ? <LoaderCircle style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} />
                : <X style={{ width: 13, height: 13 }} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatScheduleDate(value: string) {
  return scheduleDateFormatter.format(new Date(`${value}T00:00:00`));
}

function getDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return null;

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  const rawFilename = utf8Match?.[1] ?? quotedMatch?.[1];
  if (!rawFilename) return null;

  try {
    return decodeURIComponent(rawFilename);
  } catch {
    return rawFilename;
  }
}
