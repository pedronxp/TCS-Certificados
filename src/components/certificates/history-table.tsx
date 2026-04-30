"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CertificateStatus } from "@prisma/client";
import { CheckSquare2, LoaderCircle, Square, Trash2 } from "lucide-react";
import { HistoryActions } from "@/components/certificates/history-actions";

export type HistoryIssue = {
  id: string;
  verificationCode: string;
  status: CertificateStatus;
  issuedAt: string;
  revokedAt: string | null;
  deleteAt: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientDocument: string | null;
  company: string;
  templateName: string;
  issuedByName: string;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = issues.length > 0 && issues.every((issue) => selectedSet.has(issue.id));

  function toggleIssue(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
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

    if (!confirm(`Deletar ${selectedIds.length} certificado(s) selecionado(s) do sistema?`)) return;
    setBulkDeleting(true);

    try {
      const response = await fetch("/api/certificates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        alert(result?.error ?? "Não foi possível deletar os certificados selecionados.");
        return;
      }

      setSelectedIds([]);
      router.refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-t-lg border border-slate-200 bg-white">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          {canManage ? (
            <button
              type="button"
              onClick={toggleAll}
              disabled={!issues.length}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allSelected ? <CheckSquare2 className="size-4" /> : <Square className="size-4" />}
              {allSelected ? "Limpar seleção" : "Selecionar página"}
            </button>
          ) : null}
          <span className="font-medium text-slate-500">
            {selectedIds.length ? `${selectedIds.length} selecionado(s)` : `${issues.length} registro(s)`}
          </span>
        </div>

        {canManage ? (
          <button
            type="button"
            disabled={!selectedIds.length || bulkDeleting}
            onClick={deleteSelected}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Deletar selecionados
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-slate-100">
        {issues.map((issue) => {
          const selected = selectedSet.has(issue.id);

          return (
            <article
              key={issue.id}
              className={`px-4 py-4 ${
                selected ? "bg-teal-50/70" : "bg-white hover:bg-slate-50/80"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {canManage ? (
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleIssue(issue.id)}
                      aria-label={`Selecionar certificado ${issue.verificationCode}`}
                      className="mt-1 size-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                    />
                  ) : null}

                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{issue.recipientName}</p>
                    <p className="mt-1 max-w-80 break-words text-xs leading-5 text-slate-500">
                      {[issue.recipientEmail, issue.recipientDocument].filter(Boolean).join(" • ") ||
                        "Sem contato/documento"}
                    </p>
                  </div>
                </div>

                <div className="min-w-32">
                  <StatusBadge status={issue.status} />
                  {issue.revokedAt ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">em {formatDateTime(issue.revokedAt)}</p>
                  ) : null}
                  {issue.deleteAt ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">exclui em {formatDateOnly(issue.deleteAt)}</p>
                  ) : null}
                </div>

                <HistoryActions
                  key={`${issue.id}-${issue.deleteAt}`}
                  id={issue.id}
                  status={issue.status}
                  deleteAt={issue.deleteAt}
                  canManage={canManage}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3 rounded-md bg-slate-50 p-3">
                <DataBlock label="Empresa" value={issue.company} />
                <DataBlock label="Modelo" value={issue.templateName} />
                <div className="min-w-32 flex-1">
                  <p className="text-[0.68rem] font-bold uppercase text-slate-500">Código</p>
                  <Link
                    className="mt-1 block font-mono text-xs font-semibold text-teal-700 hover:underline"
                    href={`/validar/${issue.verificationCode}`}
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

        {!issues.length ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500">
            Nenhum certificado encontrado com os filtros atuais.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DataBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-32 flex-1">
      <p className="text-[0.68rem] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words leading-5 text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: CertificateStatus }) {
  if (status === "REVOKED") {
    return (
      <span className="inline-flex rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
        Revogado
      </span>
    );
  }

  return (
    <span className="inline-flex rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
      Emitido
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  return dateTimeFormatter.format(new Date(value));
}

function formatDateOnly(value: string) {
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}
