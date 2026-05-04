import { CertificateBatchStatus } from "@prisma/client";
import { issueCertificate } from "@/lib/certificate-service";
import {
  buildStaleBatchErrors,
  isBatchJobStale,
  STALE_BATCH_TIMEOUT_MS,
} from "@/lib/batch-status";
import { DATE_FIELD_KEYS } from "@/lib/date-fields";
import { prisma } from "@/lib/prisma";

export async function startBatchJob({
  templateId,
  rows,
  issuedById,
  lineOffset = 1,
}: {
  templateId: string;
  rows: Record<string, string>[];
  issuedById: string;
  lineOffset?: number;
}) {
  const firstRow = rows[0] ?? {};
  const batch = await prisma.certificateBatch.create({
    data: {
      template: { connect: { id: templateId } },
      createdBy: { connect: { id: issuedById } },
      total: rows.length,
      values: firstRow,
      company: findFirstValue(firstRow, ["empresa", "company"]),
      issuedDate: findFirstValue(firstRow, DATE_FIELD_KEYS),
    },
  });

  return runBatchJob({ batchId: batch.id, templateId, rows, issuedById, lineOffset });
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
        },
      }),
    ),
  );

  return staleBatches.length;
}

async function runBatchJob({
  batchId,
  templateId,
  rows,
  issuedById,
  lineOffset,
}: {
  batchId: string;
  templateId: string;
  rows: Record<string, string>[];
  issuedById: string;
  lineOffset: number;
}) {
  const errors: string[] = [];
  let created = 0;
  let processed = 0;

  try {
    for (const [index, row] of rows.entries()) {
      try {
        await issueCertificate({ templateId, values: row, issuedById, batchId });
        created += 1;
      } catch (error) {
        errors.push(`Linha ${index + lineOffset}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
      } finally {
        processed += 1;
        await prisma.certificateBatch.update({
          where: { id: batchId },
          data: { processed, created, errors },
        });
      }
    }

    await prisma.certificateBatch.update({
      where: { id: batchId },
      data: {
        status: CertificateBatchStatus.COMPLETED,
        processed,
        created,
        errors,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Falha ao gerar lote.");
    return prisma.certificateBatch.update({
      where: { id: batchId },
      data: {
        status: CertificateBatchStatus.FAILED,
        processed,
        created,
        errors,
        finishedAt: new Date(),
      },
    });
  }

  return prisma.certificateBatch.findUniqueOrThrow({
    where: { id: batchId },
  });
}
