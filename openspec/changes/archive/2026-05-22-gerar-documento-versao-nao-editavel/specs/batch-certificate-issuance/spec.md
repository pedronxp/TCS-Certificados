## ADDED Requirements

### Requirement: Batch creation applies selected output mode
The system SHALL allow an administrator to choose the certificate output mode for a batch and MUST apply the selected mode to every certificate created by that batch.

#### Scenario: Batch starts with editable mode
- **WHEN** an administrator starts a batch without selecting non-editable mode
- **THEN** the system creates every certificate in editable mode and preserves the current PDF plus native DOCX/PPTX output behavior

#### Scenario: Batch starts with non-editable mode
- **WHEN** an administrator starts a valid batch with non-editable mode selected
- **THEN** the system stores the batch output mode and creates every generated certificate as non-editable output

#### Scenario: Batch history reflects output mode
- **WHEN** a completed batch appears in the batch history table
- **THEN** the UI identifies whether the generated certificates were created as editable output or non-editable output
