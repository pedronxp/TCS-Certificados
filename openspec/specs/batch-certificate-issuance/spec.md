# batch-certificate-issuance Specification

## Purpose
TBD - created by archiving change corrigir-modo-noturno-ptbr-lote. Update Purpose after archive.
## Requirements
### Requirement: Batch creation accepts valid manual rows
The system SHALL allow an administrator to create a certificate batch from valid manually entered participant rows for a supported template.

#### Scenario: Manual batch starts successfully
- **WHEN** an administrator selects a supported template, fills shared fields, enters valid participant rows, reviews the preview, and submits the batch
- **THEN** the system creates a batch job, stores the normalized row values, starts progress tracking, and shows a pt-BR confirmation that the batch was started

#### Scenario: Manual batch rejects invalid participant values
- **WHEN** an administrator enters participant rows with missing required values, invalid CPF/RG values, duplicate person identifiers, or extra columns
- **THEN** the system blocks submission before creating the job and shows line-level pt-BR messages that identify what must be corrected

### Requirement: Batch creation accepts valid spreadsheets
The system SHALL allow an administrator to create a certificate batch from a valid CSV or XLSX spreadsheet when the template supports batch issuance.

#### Scenario: Spreadsheet batch starts successfully
- **WHEN** an administrator uploads a supported spreadsheet with recognizable headers, one shared company value, one shared date value, and valid participant rows
- **THEN** the system normalizes headers and values, creates a batch job with the correct line offset, and returns the job id and initial counters

#### Scenario: Spreadsheet batch rejects unsupported or malformed input
- **WHEN** the uploaded spreadsheet is unsupported, oversized, empty, missing company/date columns, mixes company/date values, or has invalid participant data
- **THEN** the system rejects the request without creating certificates and returns a pt-BR error that points to the file, column, or line causing the problem

### Requirement: Batch processing completes without duplicate or lost rows
The system MUST process each accepted batch row exactly once, preserve row-level errors, and finish the job with consistent `processed`, `created`, `total`, `status`, and `errors` values.

#### Scenario: All rows generate certificates
- **WHEN** every row in a running batch can be issued successfully
- **THEN** the system increments processed and created for every row, marks the batch completed, and exposes completed progress to the UI

#### Scenario: Some rows fail during certificate issuance
- **WHEN** one or more rows fail while calling the certificate issuance service
- **THEN** the system records each row failure with its source line, continues processing remaining rows, and completes the batch with created count plus errors matching processed rows

#### Scenario: Interrupted batch is marked failed
- **WHEN** a running batch stops updating past the stale timeout
- **THEN** the system marks it failed, preserves existing errors, clears locks, and returns a pt-BR message instructing the administrator to generate the batch again

### Requirement: Batch feedback is actionable in the UI
The system SHALL show the administrator accurate progress, final status, counters, and row/file errors for the active and historical batch jobs.

#### Scenario: Active batch progress is polled
- **WHEN** a batch job is running and the UI polls the batch endpoint
- **THEN** the response includes status, progress percentage, total, processed, created, errors, and template name for the same administrator

#### Scenario: Batch history displays final status
- **WHEN** a batch appears in the batch history table
- **THEN** the table shows pt-BR status, template, company, date, created/processed counters, errors, creator, and timestamp without theme or localization regressions

