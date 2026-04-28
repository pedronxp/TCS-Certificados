-- Improve certificate history filtering and pagination.
CREATE INDEX "CertificateTemplate_name_idx" ON "CertificateTemplate"("name");
CREATE INDEX "CertificateRecipient_name_idx" ON "CertificateRecipient"("name");
CREATE INDEX "CertificateRecipient_email_idx" ON "CertificateRecipient"("email");
CREATE INDEX "CertificateRecipient_document_idx" ON "CertificateRecipient"("document");
CREATE INDEX "CertificateIssue_issuedAt_idx" ON "CertificateIssue"("issuedAt");
CREATE INDEX "CertificateIssue_status_issuedAt_idx" ON "CertificateIssue"("status", "issuedAt");
CREATE INDEX "CertificateIssue_templateId_issuedAt_idx" ON "CertificateIssue"("templateId", "issuedAt");
CREATE INDEX "CertificateIssue_recipientId_issuedAt_idx" ON "CertificateIssue"("recipientId", "issuedAt");
CREATE INDEX "CertificateIssue_issuedById_issuedAt_idx" ON "CertificateIssue"("issuedById", "issuedAt");
CREATE INDEX "CertificateIssue_batchId_issuedAt_idx" ON "CertificateIssue"("batchId", "issuedAt");
