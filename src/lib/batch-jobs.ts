import { CertificateBatchStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { buildBatchJobValues, readBatchJobValues } from "@/lib/batch-job-values";
import { issueCertificate } from "@/lib/certificate-service";
import {
  buildStaleBatchErrors,
  isBatchJobStale,
  STALE_BATCH_TIMEOUT_MS,
} from "@/lib/batch-status";
import {
  normalizeCertificateOutputMode,
  type CertificateOutputMode,
} from "@/lib/certificate-output-format";
import { DATE_FIELD_KEYS } from "@/lib/date-fields";
import { prisma } from "@/lib/prisma";

const BATCH_ROWS_PER_POLL = 1;
const LEGACY_BATCH_VALUES_ERROR = "Lote antigo sem dados de processamento. Gere o lote novamente.";
const INCOMPLETE_BATCH_VALUES_ERROR = "Dados do lote incompletos. Gere o lote novamente.";

export async function startBatchJob({
  templateId,
  rows,
  issuedById,
  lineOffset = 1,
  isTest = false,
  outputMode = "EDITABLE",
}: {
  templateId: string;
  rows: Record<string, string>[];
  issuedById: string;
  lineOffset?: number;
  isTest?: boolean;
  outputMode?: CertificateOutputMode;
}) {
  const firstRow = rows[0] ?? {};
  const normalizedOutputMode = normalizeCertificateOutputMode(outputMode);
  const batch = await prisma.certificateBatch.create({
    data: {
      template: { connect: { id: templateId } },
      createdBy: { connect: { id: issuedById } },
      total: rows.length,
      values: buildBatchJobValues(rows, lineOffset) as Prisma.InputJsonValue,
      company: findFirstValue(firstRow, ["empresa", "company"]),
      issuedDate: findFirstValue(firstRow, DATE_FIELD_KEYS),
      isTest,
      outputMode: normalizedOutputMode,
    },
  });

  return batch;
}

function findFirstValue(row: Record<string, string>, keys: readonly string[]) {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }

  return "";
}

export async function getBatchJob(id: string, userId: string) {
  return prisma.certificateBatch.findFirst({
    where: { id, createdById: userId },
    include: { template: { select: { name: true } } },
  });
}

export async function processBatchJobChunk(id: string, userId: string, limit = BATCH_ROWS_PER_POLL) {
  const safeLimit = Math.max(1, Math.floor(limit));

  for (let processedInCall = 0; processedInCall < safeLimit; processedInCall += 1) {
    const batch = await findBatchForProcessing(id, userId);
    if (!batch || batch.status !== CertificateBatchStatus.RUNNING) break;

    const didProcess = await processNextBatchRow(batch, userId);
    if (!didProcess) break;
  }

  return getBatchJob(id, userId);
}

export async function failStaleBatchJobs(now = new Date()) {
  const candidates = await prisma.certificateBatch.findMany({
    where: {
      status: CertificateBatchStatus.RUNNING,
      updatedAt: { lt: new Date(now.getTime() - STALE_BATCH_TIMEOUT_MS) },
    },
    select: {
      id: true,
      errors: true,
      processed: true,
      total: true,
      updatedAt: true,
    },
  });

  const staleBatches = candidates.filter((batch) => isBatchJobStale(batch.updatedAt, now));

  await Promise.all(
    staleBatches.map((batch) =>
      prisma.certificateBatch.update({
        where: { id: batch.id },
        data: {
          status: CertificateBatchStatus.FAILED,
          errors: buildStaleBatchErrors({
            errors: batch.errors,
            processed: batch.processed,
            total: batch.total,
          }),
          finishedAt: now,
          lockedAt: null,
        },
      }),
    ),
  );

  return staleBatches.length;
}

type BatchForProcessing = NonNullable<Awaited<ReturnType<typeof findBatchForProcessing>>>;

function findBatchForProcessing(id: string, userId: string) {
  return prisma.certificateBatch.findFirst({
    where: { id, createdById: userId },
    select: {
      id: true,
      status: true,
      total: true,
      processed: true,
      errors: true,
      values: true,
      lockedAt: true,
      templateId: true,
      createdById: true,
      isTest: true,
      outputMode: true,
    },
  });
}

async function processNextBatchRow(batch: BatchForProcessing, userId: string) {
  if (batch.lockedAt) return false;

  const batchValues = readBatchJobValues(batch.values);
  if (!batchValues) {
    await failBatchJob(batch.id, batch.errors, LEGACY_BATCH_VALUES_ERROR);
    return false;
  }

  if (batchValues.rows.length < batch.total) {
    await failBatchJob(batch.id, batch.errors, INCOMPLETE_BATCH_VALUES_ERROR);
    return false;
  }

  if (batch.processed >= batch.total) {
    await finishBatchJobIfDone(batch.id);
    return false;
  }

  const rowIndex = batch.processed;
  const claim = await prisma.certificateBatch.updateMany({
    where: {
      id: batch.id,
      createdById: userId,
      status: CertificateBatchStatus.RUNNING,
      processed: rowIndex,
      lockedAt: null,
    },
    data: {
      processed: rowIndex + 1,
      lockedAt: new Date(),
    },
  });

  if (claim.count === 0) return false;

  const row = batchValues.rows[rowIndex];
  const line = rowIndex + batchValues.lineOffset;
  let rowError: string | null = null;

  try {
    await issueCertificate({
      templateId: batch.templateId,
      values: row,
      issuedById: batch.createdById,
      batchId: batch.id,
      isTest: batch.isTest,
      outputMode: batch.outputMode,
    });
  } catch (error) {
    rowError = `Linha ${line}: ${error instanceof Error ? error.message : "erro desconhecido"}`;
  }

  await saveBatchRowResult(batch.id, rowError);
  await finishBatchJobIfDone(batch.id);
  return true;
}

async function saveBatchRowResult(batchId: string, rowError: string | null) {
  if (!rowError) {
    await prisma.certificateBatch.updateMany({
      where: { id: batchId, status: CertificateBatchStatus.RUNNING },
      data: {
        created: { increment: 1 },
        lockedAt: null,
      },
    });
    return;
  }

  const batch = await prisma.certificateBatch.findUnique({
    where: { id: batchId },
    select: { status: true, errors: true },
  });

  if (!batch || batch.status !== CertificateBatchStatus.RUNNING) return;

  await prisma.certificateBatch.updateMany({
    where: { id: batchId, status: CertificateBatchStatus.RUNNING },
    data: {
      errors: [...normalizeBatchErrors(batch.errors), rowError],
      lockedAt: null,
    },
  });
}

async function finishBatchJobIfDone(batchId: string) {
  const batch = await prisma.certificateBatch.findUnique({
    where: { id: batchId },
    select: {
      status: true,
      total: true,
      processed: true,
      created: true,
      errors: true,
      lockedAt: true,
    },
  });

  if (!batch || batch.status !== CertificateBatchStatus.RUNNING || batch.lockedAt) return;
  if (batch.processed < batch.total) return;

  const errors = normalizeBatchErrors(batch.errors);
  if (batch.created + errors.length < batch.processed) return;

  await prisma.certificateBatch.updateMany({
    where: { id: batchId, status: CertificateBatchStatus.RUNNING, lockedAt: null },
    data: {
      status: CertificateBatchStatus.COMPLETED,
      finishedAt: new Date(),
    },
  });
}

async function failBatchJob(batchId: string, currentErrors: unknown, message: string) {
  const errors = normalizeBatchErrors(currentErrors);
  const nextErrors = errors.includes(message) ? errors : [...errors, message];

  await prisma.certificateBatch.update({
    where: { id: batchId },
    data: {
      status: CertificateBatchStatus.FAILED,
      errors: nextErrors,
      lockedAt: null,
      finishedAt: new Date(),
    },
  });
}

function normalizeBatchErrors(errors: unknown) {
  return Array.isArray(errors) ? errors.map((error) => String(error)).filter(Boolean) : [];
}
