-- CreateEnum
CREATE TYPE "CertificateBatchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "CertificateIssue" ADD COLUMN "batchId" TEXT;

-- CreateTable
CREATE TABLE "CertificateBatch" (
    "id" TEXT NOT NULL,
    "status" "CertificateBatchStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "values" JSONB NOT NULL,
    "company" TEXT NOT NULL,
    "issuedDate" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "CertificateBatch_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CertificateIssue" ADD CONSTRAINT "CertificateIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CertificateBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateBatch" ADD CONSTRAINT "CertificateBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CertificateTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateBatch" ADD CONSTRAINT "CertificateBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
