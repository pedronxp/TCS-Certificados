CREATE TYPE "CertificateOutputMode" AS ENUM ('EDITABLE', 'NON_EDITABLE');

ALTER TABLE "CertificateIssue"
ADD COLUMN "outputMode" "CertificateOutputMode" NOT NULL DEFAULT 'EDITABLE';

ALTER TABLE "CertificateBatch"
ADD COLUMN "outputMode" "CertificateOutputMode" NOT NULL DEFAULT 'EDITABLE';
