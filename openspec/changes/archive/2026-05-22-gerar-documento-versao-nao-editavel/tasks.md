## 1. Data Model

- [x] 1.1 Add `CertificateOutputMode` enum with `EDITABLE` and `NON_EDITABLE` to Prisma.
- [x] 1.2 Add `outputMode` to `CertificateIssue` with default `EDITABLE`.
- [x] 1.3 Add `outputMode` to `CertificateBatch` if batch processing needs to persist the selected mode across async processing.
- [x] 1.4 Create the Prisma migration and regenerate Prisma client types.

## 2. Backend Issuance

- [x] 2.1 Add a shared parser/normalizer for certificate output mode with default `EDITABLE`.
- [x] 2.2 Update `/api/certificates/issue` to accept and validate `outputMode`.
- [x] 2.3 Update `issueCertificate` to persist `outputMode` and keep existing behavior when the field is omitted.
- [x] 2.4 Update batch creation and processing to accept, persist, and pass `outputMode` to every issued certificate.

## 3. Download Rules

- [x] 3.1 Add a shared helper that determines whether a file type can be downloaded for a given `outputMode`.
- [x] 3.2 Update authenticated certificate download route to block DOCX/PPTX downloads for `NON_EDITABLE` certificates before loading or regenerating content.
- [x] 3.3 Update public certificate download route to block DOCX/PPTX downloads for `NON_EDITABLE` certificates before loading or regenerating content.
- [x] 3.4 Ensure PDF download and regeneration continue to work for both output modes.

## 4. UI

- [x] 4.1 Add an output mode control to individual certificate issuance with clear pt-BR labels for editable file and non-editable PDF final.
- [x] 4.2 Send the selected `outputMode` from individual issuance to the API.
- [x] 4.3 Update completed certificate page to hide native download and highlight PDF final for `NON_EDITABLE` certificates.
- [x] 4.4 Update history table/actions to reflect output mode in labels, badges, and available actions.
- [x] 4.5 Update public validation page to hide DOCX/PPTX download for `NON_EDITABLE` certificates.
- [x] 4.6 Add the output mode control and history indicator to the batch issuance flow.

## 5. Tests and Validation

- [x] 5.1 Add unit tests for output mode normalization and download availability rules.
- [x] 5.2 Add API tests for authenticated PDF/native downloads in both output modes.
- [x] 5.3 Add API tests for public PDF/native downloads in both output modes.
- [x] 5.4 Add or update issuance tests to assert default `EDITABLE` behavior and selected `NON_EDITABLE` persistence.
- [x] 5.5 Add or update batch tests to assert the selected output mode is applied to every generated certificate.
- [x] 5.6 Run `npm run test`.
- [x] 5.7 Run `npm run lint`.
- [x] 5.8 Run `npm run build`.
