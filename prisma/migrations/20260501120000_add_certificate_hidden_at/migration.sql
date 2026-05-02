-- AlterTable
ALTER TABLE "CertificateIssue" ADD COLUMN "hiddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CertificateIssue_hiddenAt_idx" ON "CertificateIssue"("hiddenAt");
