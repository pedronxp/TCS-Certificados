import type { CertificateBatchStatus } from "@prisma/client";

export const STALE_BATCH_TIMEOUT_MS = 10 * 60 * 1000;

export const BATCH_STATUS_LABELS: Record<CertificateBatchStatus, string> = {
  RUNNING: "Gerando",
  COMPLETED: "Concluido",
  FAILED: "Falha",
};

export function isBatchJobStale(updatedAt: Date, now = new Date()) {
  return now.getTime() - updatedAt.getTime() >= STALE_BATCH_TIMEOUT_MS;
}

export function buildStaleBatchErrors({
  errors,
  processed,
  total,
}: {
  errors: unknown;
  processed: number;
  total: number;
}) {
  const currentErrors = Array.isArray(errors)
    ? errors.map((error) => String(error)).filter(Boolean)
    : [];
  const staleMessage = `Lote interrompido antes de terminar (${processed}/${total} processados). Gere o lote novamente.`;

  if (currentErrors.includes(staleMessage)) return currentErrors;
  return [...currentErrors, staleMessage];
}
