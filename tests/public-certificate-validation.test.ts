import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getIssueDocumentCandidates,
  maskDocumentForDisplay,
  verifyIssueDocument,
} from "../src/lib/public-certificate-validation";

test("matches CPF documents with or without punctuation", () => {
  const issue = {
    recipient: { document: "123.456.789-00" },
    values: {},
  };

  assert.equal(verifyIssueDocument(issue, "12345678900").matched, true);
  assert.equal(verifyIssueDocument(issue, "123.456.789-99").matched, false);
});

test("matches RG using number and state placeholders", () => {
  const issue = {
    recipient: { document: null },
    values: {
      id: "12.345.678",
      uf: "MG",
    },
  };

  assert.equal(verifyIssueDocument(issue, "MG 12345678").matched, true);
  assert.equal(verifyIssueDocument(issue, "12345678").matched, false);
  assert.deepEqual(getIssueDocumentCandidates(issue), ["MG 12.345.678"]);
});

test("uses document-like template values as public validation candidates", () => {
  const issue = {
    recipient: { document: null },
    values: {
      documento: "AB 009877",
      nome: "Maria Silva",
    },
  };

  assert.equal(verifyIssueDocument(issue, "AB009877").matched, true);
  assert.equal(verifyIssueDocument(issue, "Maria Silva").matched, false);
});

test("masks documents for public display", () => {
  assert.equal(maskDocumentForDisplay("12345678900"), "***.456.789-**");
  assert.equal(maskDocumentForDisplay("12345678000199"), "**.345.678/****-**");
  assert.equal(maskDocumentForDisplay("MG 12.345.678"), "MG******78");
});
