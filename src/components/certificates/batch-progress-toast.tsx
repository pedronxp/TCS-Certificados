"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const completedRedirectedRef = useRef<string | null>(null);

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
        if (nextJob.status === "completed" && completedRedirectedRef.current !== nextJob.id) {
          completedRedirectedRef.current = nextJob.id;
          router.push(`/certificados/concluido?batchId=${nextJob.id}`);
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
    <div className="batch-progress-toast">
      <div className="batch-progress-content">
        <div className="batch-progress-icon">
          {status === "running" ? (
            <LoaderCircle className="size-5 animate-spin batch-progress-icon-brand" />
          ) : status === "completed" && !hasErrors ? (
            <CheckCircle2 className="size-5 batch-progress-icon-success" />
          ) : (
            <AlertCircle className="size-5 batch-progress-icon-warning" />
          )}
        </div>
        <div className="batch-progress-body">
          <div className="batch-progress-header">
            <p className="batch-progress-title">{title}</p>
            <button
              type="button"
              onClick={close}
              className="batch-progress-close"
              aria-label="Fechar notificação"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="batch-progress-meta">
            {job
              ? `${job.processed}/${job.total} processados, ${job.created} gerados`
              : "Iniciando geração do lote"}
          </p>
          <div className="batch-progress-bar">
            <div className="batch-progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="batch-progress-footer">
            <span>{progress}%</span>
            {job?.errors.length ? <span>{job.errors.length} com erro</span> : null}
          </div>
          {job?.fatalError ? <p className="batch-progress-error batch-progress-error-danger">{job.fatalError}</p> : null}
          {job?.errors.length ? (
            <p className="batch-progress-error batch-progress-error-warning">{job.errors[0]}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
