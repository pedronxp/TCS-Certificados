## 1. Discovery and Reproduction

- [x] 1.1 Confirm the current branch and working tree; do not modify existing unrelated dirty files under `cursos/` or existing screenshots.
- [x] 1.2 Read `AGENTS.md`, `CLAUDE.md`, `README.md`, `package.json`, and the relevant Next.js 16 docs under `node_modules/next/dist/docs/` before editing App Router or route handlers.
- [x] 1.3 Reproduce the dark-mode issue on the public home/validation surfaces and the authenticated batch page, capturing the affected selectors or components.
- [x] 1.4 Reproduce the batch creation error and classify it as manual entry, CSV/XLS/XLSX upload, API validation, job processing, polling, or history display.
- [x] 1.5 Search the affected flow for user-facing strings without proper pt-BR accents or domain wording.

## 2. Dark Mode and pt-BR Corrections

- [x] 2.1 Correct dark-mode colors through existing theme tokens and `html.dark` selectors in `src/app/globals.css` or existing component classes.
- [x] 2.2 Verify that public validation home, validation result, document viewer, and batch issuance page remain readable in dark mode.
- [x] 2.3 Preserve light-mode layout, spacing, focus states, and available actions while changing dark-mode styles.
- [x] 2.4 Correct visible pt-BR copy in the affected UI, including labels, hints, warnings, success messages, empty states, and errors.
- [x] 2.5 Move repeated domain formatting or validation messages into shared helpers/constants when the same wording appears in UI and API paths.

## 3. Batch Issuance Fix

- [x] 3.1 Fix the root cause of the batch creation error without replacing the existing job-based processing architecture.
- [x] 3.2 Ensure valid manual participant rows create a batch job with normalized row values and a visible progress notification.
- [x] 3.3 Ensure valid CSV/XLSX spreadsheets still parse headers, shared company/date values, participant fields, and line offsets correctly.
- [x] 3.4 Ensure invalid rows are rejected before certificate creation when possible, with actionable pt-BR messages including file, column, or line context.
- [x] 3.5 Ensure running jobs process each accepted row once, preserve row-level errors, clear locks, and finish with consistent `processed`, `created`, `total`, `status`, and `errors`.
- [x] 3.6 Ensure stale or interrupted batches fail with preserved errors and clear pt-BR recovery guidance.

## 4. Automated Validation

- [x] 4.1 Add or update focused tests for the batch bug reproduced in task 1.4.
- [x] 4.2 Add or update tests for shared pt-BR formatting or validation helpers touched by the fix.
- [x] 4.3 Run `npm run test` and record the result.
- [x] 4.4 Run `npm run lint` and record the result.
- [x] 4.5 Run `npm run build` and record the result.

## 5. Visual and Reviewer Handoff

- [x] 5.1 Start the local app and validate the affected pages in both light and dark modes.
- [x] 5.2 Validate one successful batch creation path and one failing/invalid batch path in the real UI or route-level equivalent.
- [x] 5.3 Capture or describe the before/after evidence needed by the Reviewer.
- [x] 5.4 Return Executor handoff with summary, changed files, validation commands, command results, risks, and reviewer notes.
