"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";

type BatchJobStatus = "running" | "completed" | "failed";

type BatchJobResponse = {
  id: string;
  status: BatchJobStatus;
  total: number;
  processed: number;
  created: number;
  errors: string[];
  progress: number;
  fatalError?: string;
};

const activeBatchJobKey = "tcs-active-batch-job";
const activeBatchJobEvent = "tcs-active-batch-job-change";

export function notifyBatchJobStarted(jobId: string) {
  window.localStorage.setItem(activeBatchJobKey, jobId);
  window.dispatchEvent(new CustomEvent(activeBatchJobEvent));
}

export function BatchProgressToast() {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BatchJobResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    function syncJobId() {
      setJobId(window.localStorage.getItem(activeBatchJobKey));
      setHidden(false);
    }

    syncJobId();
    window.addEventListener("storage", syncJobId);
    window.addEventListener(activeBatchJobEvent, syncJobId);
    return () => {
      window.removeEventListener("storage", syncJobId);
      window.removeEventListener(activeBatchJobEvent, syncJobId);
    };
  }, []);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let cancelled = false;

    async function loadJob() {
      const response = await fetch(`/api/certificates/batch?jobId=${jobId}`, { cache: "no-store" });

      if (!response.ok) {
        if (!cancelled) {
          window.localStorage.removeItem(activeBatchJobKey);
          setJobId(null);
          setJob(null);
        }
        return;
      }

      const nextJob = (await response.json()) as BatchJobResponse;
      if (!cancelled) {
        setJob(nextJob);
        if (nextJob.status !== "running") {
          router.refresh();
        }
      }
    }

    void loadJob();
    const interval = window.setInterval(loadJob, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, router]);

  const title = useMemo(() => {
    if (!job) return "Preparando lote";
    if (job.status === "completed") return "Lote finalizado";
    if (job.status === "failed") return "Falha no lote";
    return "Gerando certificados";
  }, [job]);

  if (!jobId || hidden) return null;

  const progress = job?.progress ?? 0;
  const status = job?.status ?? "running";
  const hasErrors = Boolean(job?.errors.length);

  function close() {
    setHidden(true);
    if (status !== "running") {
      window.localStorage.removeItem(activeBatchJobKey);
      setJobId(null);
      setJob(null);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {status === "running" ? (
            <LoaderCircle className="size-5 animate-spin text-teal-700" />
          ) : status === "completed" && !hasErrors ? (
            <CheckCircle2 className="size-5 text-teal-700" />
          ) : (
            <AlertCircle className="size-5 text-amber-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-950">{title}</p>
            <button
              type="button"
              onClick={close}
              className="grid size-7 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              aria-label="Fechar notificacao"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {job
              ? `${job.processed}/${job.total} processados, ${job.created} gerados`
              : "Iniciando geracao do lote"}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>{progress}%</span>
            {job?.errors.length ? <span>{job.errors.length} com erro</span> : null}
          </div>
          {job?.fatalError ? <p className="mt-2 text-xs font-medium text-red-700">{job.fatalError}</p> : null}
          {job?.errors.length ? (
            <p className="mt-2 line-clamp-2 text-xs text-amber-800">{job.errors[0]}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
