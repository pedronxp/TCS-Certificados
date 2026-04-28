import { CertificateBatchStatus } from "@prisma/client";
import { issueCertificate } from "@/lib/certificate-service";
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
      company: firstRow.empresa || firstRow.company || "",
      issuedDate: firstRow.data || firstRow.date || firstRow.data_emissao || firstRow.data_de_emissao || "",
    },
  });

  void runBatchJob({ batchId: batch.id, templateId, rows, issuedById, lineOffset });
  return batch;
}

export async function getBatchJob(id: string, userId: string) {
  return prisma.certificateBatch.findFirst({
    where: { id, createdById: userId },
    include: { template: { select: { name: true } } },
  });
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
    await prisma.certificateBatch.update({
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
}
