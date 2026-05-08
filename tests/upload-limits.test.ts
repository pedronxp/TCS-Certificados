import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_BATCH_ROWS,
  MAX_BATCH_UPLOAD_BYTES,
  MAX_TEMPLATE_PAYLOAD_BYTES,
  validateBatchRowCount,
  validateBatchSpreadsheetFile,
  validateDocxFile,
  validateTemplateImportFile,
  validateTemplatePayloadSize,
} from "../src/lib/upload-limits";

test("accepts supported batch spreadsheet formats", () => {
  assert.equal(validateBatchSpreadsheetFile(file("lista.csv", "text/csv", 10)), null);
  assert.equal(validateBatchSpreadsheetFile(file("lista.xlsx", "application/octet-stream", 10)), null);
});

test("rejects oversized or unsupported batch spreadsheets", () => {
  assert.match(
    validateBatchSpreadsheetFile(file("lista.csv", "text/csv", MAX_BATCH_UPLOAD_BYTES + 1)) ?? "",
    /Arquivo muito grande/,
  );
  assert.match(validateBatchSpreadsheetFile(file("lista.txt", "text/plain", 10)) ?? "", /CSV ou XLSX/);
});

test("validates template and DOCX uploads", () => {
  assert.equal(validateDocxFile(file("modelo.docx", "application/octet-stream", 10)), null);
  assert.equal(validateTemplateImportFile(file("modelo.pdf", "application/pdf", 10)), null);
  assert.match(validateDocxFile(file("modelo.pdf", "application/pdf", 10)) ?? "", /DOCX/);
});

test("limits batch row count", () => {
  assert.equal(validateBatchRowCount(MAX_BATCH_ROWS), null);
  assert.match(validateBatchRowCount(MAX_BATCH_ROWS + 1) ?? "", /maximo/);
});

test("limits saved template payload size", () => {
  assert.equal(validateTemplatePayloadSize({ layout: { elements: [] } }), null);
  assert.match(
    validateTemplatePayloadSize({ layout: { baseFileDataUrl: "x".repeat(MAX_TEMPLATE_PAYLOAD_BYTES) } }) ?? "",
    /Modelo muito grande/,
  );
});

function file(name: string, type: string, size: number) {
  return new File([new Uint8Array(size)], name, { type });
}
