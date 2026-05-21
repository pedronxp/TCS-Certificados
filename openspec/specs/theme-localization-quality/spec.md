# theme-localization-quality Specification

## Purpose
TBD - created by archiving change corrigir-modo-noturno-ptbr-lote. Update Purpose after archive.
## Requirements
### Requirement: Dark mode surfaces remain readable
The system SHALL render affected public and authenticated certificate pages with readable contrast, coherent surfaces, visible borders, and visible focus states when `html.dark` is active.

#### Scenario: Public validation home in dark mode
- **WHEN** the public validation home is opened with dark mode active
- **THEN** the hero text, validation card, input fields, buttons, badges, and header controls remain readable and visually coherent

#### Scenario: Certificate validation result in dark mode
- **WHEN** a certificate validation result is opened with dark mode active
- **THEN** the result card, document viewer, metadata, sensitive document field, and action states remain readable without light-only artifacts

#### Scenario: Batch issuance page in dark mode
- **WHEN** an administrator opens the batch issuance page with dark mode active
- **THEN** the step controls, form fields, warning messages, preview table, progress feedback, and batch history remain readable and aligned with the app theme tokens

### Requirement: Theme changes do not regress light mode
The system MUST preserve the existing light-mode layout and usability while correcting dark-mode behavior.

#### Scenario: Same page in light and dark modes
- **WHEN** the same affected page is toggled between light and dark modes
- **THEN** content, spacing, controls, validation states, and available actions remain equivalent across both themes

### Requirement: User-facing Portuguese is natural and complete
The system SHALL display user-facing labels, hints, empty states, warnings, success messages, and validation errors in Brazilian Portuguese with correct accents and domain wording.

#### Scenario: Batch flow validation message
- **WHEN** the batch flow blocks submission because a required value is missing or invalid
- **THEN** the message explains the correction in pt-BR without unaccented words such as "emissao", "invalido", "Voce", or "seguranca" in the rendered UI

#### Scenario: Public validation copy
- **WHEN** a participant reads the public certificate validation pages
- **THEN** the visible copy uses pt-BR terminology consistently for certificate, validation code, participant document, availability, expiration, and download state

### Requirement: Shared formatting remains consistent
The system MUST use shared formatting rules for CPF, RG, dates, month names, and certificate template fields wherever those values appear in affected UI, API feedback, previews, or rendered certificates.

#### Scenario: Formatted field appears in preview and generated certificate
- **WHEN** a CPF, RG, date, month, or period value is entered in a corrected flow
- **THEN** the preview, API-accepted row, certificate values, and user feedback use the same normalized pt-BR format

