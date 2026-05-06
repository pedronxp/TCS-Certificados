-- Keep certificate validation numbering reserved in the database.
-- The sequence is global across years; the display year still comes from issuedAt.

CREATE TABLE "CertificateSequence" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateSequence_pkey" PRIMARY KEY ("id")
);

WITH existing_sequences AS (
    SELECT substring("verificationCode" from '^TCS-BR-[0-9]{4}-([0-9]+)$') AS sequence
    FROM "CertificateIssue"
)
INSERT INTO "CertificateSequence" ("id", "value", "updatedAt")
SELECT 'global', COALESCE(MAX(sequence::integer), 0), CURRENT_TIMESTAMP
FROM existing_sequences
WHERE sequence IS NOT NULL;
