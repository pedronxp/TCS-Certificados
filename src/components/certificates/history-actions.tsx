"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CertificateStatus } from "@prisma/client";
import { Ban, CalendarCheck2, FileDown, LoaderCircle, Trash2, X } from "lucide-react";

type PendingAction = "revoke" | "delete" | "schedule" | "clear" | null;

export function HistoryActions({
  id,
  status,
  deleteAt,
  canManage,
}: {
  id: string;
  status: CertificateStatus;
  deleteAt: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [savedDate, setSavedDate] = useState(deleteAt);
  const [scheduledDate, setScheduledDate] = useState(deleteAt);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const disabled = !canManage || Boolean(pendingAction);

  async function revoke() {
    if (!confirm("Revogar este certificado? A página pública passará a mostrar o status revogado.")) return;
    setPendingAction("revoke");

    try {
      const response = await fetch(`/api/certificates/${id}/revoke`, { method: "POST" });
      if (!response.ok) {
        alert("Não foi possível revogar o certificado.");
        return;
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function saveSchedule(nextDate = scheduledDate, action: PendingAction = "schedule") {
    setPendingAction(action);

    try {
      const response = await fetch(`/api/certificates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAt: nextDate || null }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.error ?? "Não foi possível salvar o prazo de exclusão.");
        return;
      }

      setSavedDate(nextDate);
      setScheduledDate(nextDate);
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteNow() {
    if (!confirm("Deletar este certificado do sistema? Os arquivos gerados também serão removidos.")) return;
    setPendingAction("delete");

    try {
      const response = await fetch(`/api/certificates/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.error ?? "Não foi possível deletar o certificado.");
        return;
      }
      router.refresh();
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="w-[220px] max-w-full space-y-2">
      <div className="flex gap-1.5">
        <a
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-slate-100 px-1 text-[0.68rem] font-bold text-slate-700 hover:bg-slate-200"
          href={`/api/certificates/${id}/download/pdf`}
          title="Baixar PDF"
        >
          <FileDown className="size-3.5" />
          PDF
        </a>
        <a
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md bg-slate-100 px-1 text-[0.68rem] font-bold text-slate-700 hover:bg-slate-200"
          href={`/api/certificates/${id}/download/docx`}
          title="Baixar DOCX"
        >
          <FileDown className="size-3.5" />
          DOCX
        </a>
        <button
          type="button"
          disabled={disabled || status === "REVOKED"}
          onClick={revoke}
          className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          title={canManage ? "Revogar certificado" : "Apenas administradores"}
          aria-label="Revogar certificado"
        >
          {pendingAction === "revoke" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={deleteNow}
          className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-950 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={canManage ? "Deletar do sistema" : "Apenas administradores"}
          aria-label="Deletar do sistema"
        >
          {pendingAction === "delete" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      </div>

      <div className="flex gap-1.5 rounded-md bg-slate-50 p-1.5">
        <label className="min-w-0 flex-1">
          <input
            type="date"
            value={scheduledDate}
            disabled={disabled}
            onChange={(event) => setScheduledDate(event.target.value)}
            aria-label="Excluir automaticamente em"
            className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
            title="Prazo para deletar automaticamente"
          />
        </label>
        <button
          type="button"
          disabled={disabled || scheduledDate === savedDate}
          onClick={() => saveSchedule()}
          className="inline-grid h-9 w-9 shrink-0 place-items-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Salvar prazo de exclusão"
        >
          {pendingAction === "schedule" ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarCheck2 className="size-4" />}
        </button>
        <button
          type="button"
          disabled={disabled || !savedDate}
          onClick={() => {
            setScheduledDate("");
            void saveSchedule("", "clear");
          }}
          className="inline-grid h-9 w-9 shrink-0 place-items-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Limpar prazo de exclusão"
        >
          {pendingAction === "clear" ? <LoaderCircle className="size-4 animate-spin" /> : <X className="size-4" />}
        </button>
      </div>
    </div>
  );
}
