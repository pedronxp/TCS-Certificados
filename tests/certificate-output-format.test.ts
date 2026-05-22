import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  canDownloadCertificateFile,
  certificateOutputModeLabel,
  normalizeCertificateOutputMode,
  shouldRegenerateCertificateFile,
} from "../src/lib/certificate-output-format";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

test("regenerates stored Office PDFs when page count no longer matches the template", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.3, 841.9]);
  pdf.addPage([595.3, 841.9]);

  assert.equal(
    await shouldRegenerateCertificateFile("PDF", nativeDocxLayout(), Buffer.from(await pdf.save())),
    true,
  );
});

test("keeps stored Office PDFs when native point size matches the template", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.3, 841.9]);

  assert.equal(
    await shouldRegenerateCertificateFile("PDF", nativeDocxLayout(), Buffer.from(await pdf.save())),
    false,
  );
});

function nativeDocxLayout() {
  return {
    baseDocumentMode: "native",
    baseFileName: "Suporte Basico de Vida V2.docx",
    baseFileType: docxMimeType,
    baseFileDataUrl: `data:${docxMimeType};base64,AAAA`,
    basePages: [
      {
        index: 0,
        width: 794,
        height: 1123,
        orientation: "portrait",
      },
    ],
    elements: [],
  };
}
