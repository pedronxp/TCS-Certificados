"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CertificateStatus } from "@prisma/client";
import { Ban, CalendarCheck2, Eye, EyeOff, FileDown, FileX, LoaderCircle, ShieldCheck, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/confirmation-dialog";

type PendingAction = "download-pdf" | "download-native" | "revoke" | "expire" | "schedule" | "clear" | "hide" | "delete" | null;
type DownloadType = "pdf" | "docx" | "pptx";
type NativeDownloadType = "docx" | "pptx";

const scheduleDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export function HistoryActions({
  id,
  verificationCode,
  status,
  deleteAt,
  hiddenAt,
  documentAvailable,
  documentExpired,
  nativeDownloadType,
  nativeDownloadLabel,
  canDownloadNative,
  canManage,
}: {
  id: string;
  verificationCode: string;
  status: CertificateStatus;
  deleteAt: string | null;
  hiddenAt: string | null;
  documentAvailable: boolean;
  documentExpired: boolean;
  nativeDownloadType: NativeDownloadType;
  nativeDownloadLabel: "DOCX" | "PPTX";
  canDownloadNative: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const [savedDate, setSavedDate] = useState(deleteAt ?? "");
  const [scheduledDate, setScheduledDate] = useState(deleteAt ?? "");
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const disabled = !canManage || Boolean(pendingAction);
  const expireDisabled = disabled || documentExpired;
  const downloadDisabled = Boolean(pendingAction) || !documentAvailable;

  async function downloadFile(type: DownloadType) {
    if (pendingAction || !documentAvailable || documentExpired) return;

    setPendingAction(type === "pdf" ? "download-pdf" : "download-native");
    try {
      const res = await fetch(`/api/certificates/${id}/download/${type}${type === "pdf" ? "?regenerate=1" : ""}`);
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
      if (!res.ok) {
        alert("Não foi possível revogar o certificado.");
        return;
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function saveSchedule(nextDate = scheduledDate, action: PendingAction = "schedule") {
    const confirmed = await confirm({
      title: nextDate ? "Programar expiração" : "Limpar expiração programada",
      message: nextDate
        ? `Os arquivos deste certificado serão removidos em ${formatScheduleDate(nextDate)}. O código e a validação continuam salvos.`
        : "A data de expiração automática será removida.",
      confirmLabel: nextDate ? "Programar" : "Limpar programação",
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
        alert(result?.error ?? "Não foi possível salvar o prazo.");
        return;
      }
      setSavedDate(nextDate);
      setScheduledDate(nextDate);
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function expireNow() {
    const confirmed = await confirm({
      title: "Remover documentos",
      message: "Os arquivos deste certificado serão removidos agora. O certificado, o código e a validação continuam no sistema.",
      confirmLabel: "Remover documentos",
      tone: "danger",
    });
    if (!confirmed) return;
    setPendingAction("expire");
    try {
      const res = await fetch(`/api/certificates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        alert(result?.error ?? "Não foi possível remover os documentos.");
        return;
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function deletePermanently() {
    const confirmed = await confirm({
      title: "Excluir certificado do sistema",
      message: "Isso apaga definitivamente este certificado, seus arquivos, codigo de validacao e registro no historico. Esta acao nao pode ser desfeita.",
      confirmLabel: "Excluir definitivamente",
      tone: "danger",
    });
    if (!confirmed) return;
    setPendingAction("delete");
    try {
      const res = await fetch(`/api/certificates/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-permanently" }),
      });
      if (!res.ok) {
        const result = await res.json().catch(() => null);
        alert(result?.error ?? "Nao foi possivel excluir o certificado.");
        return;
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function toggleHidden() {
    const nextHidden = !hiddenAt;
    const confirmed = await confirm({
      title: nextHidden ? "Ocultar do histórico" : "Reexibir no histórico",
      message: nextHidden
        ? "O certificado ficará salvo, mas sai da lista padrão."
        : "O certificado voltará a aparecer na lista padrão.",
      confirmLabel: nextHidden ? "Ocultar" : "Reexibir",
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
        alert(result?.error ?? "Não foi possível atualizar a visibilidade.");
        return;
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="history-actions">
      {confirmationDialog}
      <div className="history-action-row">
        <button
          type="button"
          onClick={() => downloadFile("pdf")}
          disabled={downloadDisabled}
          title={documentAvailable ? "Baixar PDF" : "Documento expirado"}
          className="history-action-button"
        >
          {pendingAction === "download-pdf"
            ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
            : <FileDown style={{ width: 13, height: 13 }} />}
          PDF
        </button>

        {canDownloadNative ? (
          <button
            type="button"
            onClick={() => downloadFile(nativeDownloadType)}
            disabled={downloadDisabled}
            title={documentAvailable ? `Baixar ${nativeDownloadLabel}` : "Documento expirado"}
            className="history-action-button"
          >
            {pendingAction === "download-native"
              ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
              : <FileDown style={{ width: 13, height: 13 }} />}
            {nativeDownloadLabel}
          </button>
        ) : null}

        <a
          href={`/validar/${verificationCode}`}
          title="Abrir validação"
          target="_blank"
          rel="noreferrer"
          className="history-action-button"
        >
          <ShieldCheck style={{ width: 13, height: 13 }} />
          Validar
        </a>

        {canManage ? (
          <>
            <button
              type="button"
              disabled={disabled || status === "REVOKED"}
              onClick={revoke}
              title="Revogar certificado"
              className="history-action-icon history-action-danger"
            >
              {pendingAction === "revoke"
                ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
                : <Ban style={{ width: 13, height: 13 }} />}
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={toggleHidden}
              title={hiddenAt ? "Reexibir" : "Ocultar"}
              className="history-action-icon history-action-warning"
            >
              {pendingAction === "hide"
                ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
                : hiddenAt
                  ? <Eye style={{ width: 13, height: 13 }} />
                  : <EyeOff style={{ width: 13, height: 13 }} />}
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => setScheduleVisible((v) => !v)}
              title={scheduleVisible ? "Esconder programação" : "Programar expiração"}
              className={`history-action-icon${scheduleVisible || savedDate ? " history-action-active" : ""}`}
            >
              <CalendarCheck2 style={{ width: 13, height: 13 }} />
            </button>

            <button
              type="button"
              disabled={expireDisabled}
              onClick={expireNow}
              title={documentExpired ? "Documentos já expirados" : "Remover documentos agora"}
              className="history-action-icon history-action-danger"
            >
              {pendingAction === "expire"
                ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
                : <FileX style={{ width: 13, height: 13 }} />}
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={deletePermanently}
              title="Excluir certificado do sistema"
              className="history-action-icon history-action-danger"
            >
              {pendingAction === "delete"
                ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
                : <Trash2 style={{ width: 13, height: 13 }} />}
            </button>
          </>
        ) : null}
      </div>

      {canManage && scheduleVisible && (
        <div className="history-schedule-panel">
          <div className="history-schedule-header">
            <span>Expiração programada</span>
            <button
              type="button"
              onClick={() => setScheduleVisible(false)}
              className="history-schedule-close"
              title="Fechar programação"
            >
              <EyeOff style={{ width: 12, height: 12 }} />
            </button>
          </div>
          <div className="history-schedule-fields">
            <input
              type="date"
              value={scheduledDate}
              disabled={disabled}
              onChange={(e) => setScheduledDate(e.target.value)}
              aria-label="Data de expiração automática"
            />
            <button
              type="button"
              disabled={disabled || scheduledDate === savedDate}
              onClick={() => saveSchedule()}
              title="Salvar data"
              className="history-schedule-button"
            >
              {pendingAction === "schedule"
                ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
                : <CalendarCheck2 style={{ width: 13, height: 13 }} />}
            </button>
            <button
              type="button"
              disabled={disabled || !savedDate}
              onClick={() => saveSchedule("", "clear")}
              title="Limpar data"
              className="history-schedule-button"
            >
              {pendingAction === "clear"
                ? <LoaderCircle className="history-spin-icon" style={{ width: 13, height: 13 }} />
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
