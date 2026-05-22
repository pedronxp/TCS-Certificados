import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canDownloadCertificateFile,
  certificateOutputModeLabel,
  normalizeCertificateOutputMode,
} from "../src/lib/certificate-output-format";

test("normalizes certificate output mode with editable as default", () => {
  assert.equal(normalizeCertificateOutputMode(undefined), "EDITABLE");
  assert.equal(normalizeCertificateOutputMode(null), "EDITABLE");
  assert.equal(normalizeCertificateOutputMode(""), "EDITABLE");
  assert.equal(normalizeCertificateOutputMode("invalid"), "EDITABLE");
  assert.equal(normalizeCertificateOutputMode("editable"), "EDITABLE");
  assert.equal(normalizeCertificateOutputMode("non_editable"), "NON_EDITABLE");
});

test("download policy keeps native files available for editable certificates", () => {
  assert.equal(canDownloadCertificateFile("EDITABLE", "PDF"), true);
  assert.equal(canDownloadCertificateFile("EDITABLE", "DOCX"), true);
  assert.equal(canDownloadCertificateFile("EDITABLE", "PPTX"), true);
});

test("authenticated download policy blocks native files for non-editable certificates", () => {
  assert.equal(canDownloadCertificateFile("NON_EDITABLE", "PDF"), true);
  assert.equal(canDownloadCertificateFile("NON_EDITABLE", "DOCX"), false);
  assert.equal(canDownloadCertificateFile("NON_EDITABLE", "PPTX"), false);
});

test("public download policy uses the same non-editable native block", () => {
  assert.equal(canDownloadCertificateFile(normalizeCertificateOutputMode("NON_EDITABLE"), "PDF"), true);
  assert.equal(canDownloadCertificateFile(normalizeCertificateOutputMode("NON_EDITABLE"), "DOCX"), false);
});

test("issuance and batch payloads share output mode labels", () => {
  assert.equal(certificateOutputModeLabel(normalizeCertificateOutputMode(undefined)), "PDF + arquivo editavel");
  assert.equal(certificateOutputModeLabel(normalizeCertificateOutputMode("NON_EDITABLE")), "PDF final nao editavel");
});
