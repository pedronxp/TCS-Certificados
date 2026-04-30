-- Add optional automatic deletion deadline for issued certificates.
ALTER TABLE "CertificateIssue" ADD COLUMN IF NOT EXISTS "deleteAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CertificateIssue_deleteAt_idx" ON "CertificateIssue"("deleteAt");
