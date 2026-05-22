# certificate-output-protection Specification

## Purpose
TBD - created by archiving change gerar-documento-versao-nao-editavel. Update Purpose after archive.
## Requirements
### Requirement: Certificate issuance records output mode
The system SHALL allow an authenticated issuer to choose the certificate output mode when issuing a certificate and MUST persist that mode with the issued certificate.

#### Scenario: Editable mode remains the default
- **WHEN** an authenticated issuer generates a certificate without selecting a non-editable mode
- **THEN** the system creates the certificate in editable mode and keeps the current PDF plus native DOCX/PPTX download behavior

#### Scenario: Non-editable mode is selected
- **WHEN** an authenticated issuer selects non-editable mode and generates a certificate
- **THEN** the system stores the certificate as non-editable output and treats the final PDF as the primary downloadable document

### Requirement: Non-editable certificates do not expose native editable files
The system MUST prevent native editable certificate files from being downloaded when an issued certificate was generated in non-editable mode.

#### Scenario: Authenticated native download is blocked
- **WHEN** an authenticated user requests the DOCX or PPTX download for a certificate generated in non-editable mode
- **THEN** the system rejects the request with a controlled error and does not return the native editable file

#### Scenario: Public native download is blocked
- **WHEN** a public validation user requests the DOCX or PPTX download for a certificate generated in non-editable mode
- **THEN** the system rejects the request with a controlled error and does not return the native editable file

#### Scenario: PDF download remains available
- **WHEN** a user requests the PDF for a certificate generated in non-editable mode and the document is not expired
- **THEN** the system returns the rendered PDF or regenerates it using the existing regeneration rules

### Requirement: Output mode is visible in certificate actions
The system SHALL present certificate download actions using labels and availability that match the certificate output mode.

#### Scenario: Completed certificate page shows non-editable output
- **WHEN** an issuer lands on the completed certificate page for a non-editable certificate
- **THEN** the page shows the PDF as the available final document and does not offer a native editable download action

#### Scenario: History actions respect output mode
- **WHEN** a certificate appears in authenticated history
- **THEN** the available download buttons and labels reflect whether the certificate was generated as editable or non-editable

#### Scenario: Public validation respects output mode
- **WHEN** a participant validates a certificate generated in non-editable mode
- **THEN** the public page offers the PDF final document and does not present DOCX/PPTX as an available download
