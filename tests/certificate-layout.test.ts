import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractVariables,
  normalizeVisualDocxLayout,
  templateLayoutSchema,
} from "../src/lib/certificate-layout";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test("does not expose COD as a manual template variable", () => {
  const layout = templateLayoutSchema.parse({
    basePreviewHtml: "Certificado {{nome}} - {{COD}} - {{codigo}}",
    elements: [
      {
        id: "cod",
        type: "text",
        content: "{{COD}} {{codigo_validacao}}",
      },
    ],
  });

  assert.deepEqual(extractVariables(layout), [
    {
      key: "nome",
      label: "Aluno",
      required: true,
    },
  ]);
});

test("editable DOCX layouts expose variables from editable elements only", () => {
  const layout = templateLayoutSchema.parse({
    baseDocumentMode: "editable",
    basePreviewHtml: "Texto antigo {{nome_antigo}}",
    elements: [
      {
        id: "line",
        type: "text",
        content: "Texto editado {{nome_novo}}",
      },
    ],
  });

  assert.deepEqual(extractVariables(layout), [
    {
      key: "nome_novo",
      label: "Nome Novo",
      required: true,
    },
  ]);
});

test("visual editable DOCX layouts normalize to native base variables", () => {
  const layout = normalizeVisualDocxLayout(templateLayoutSchema.parse({
    baseDocumentMode: "editable",
    baseFileName: "modelo.docx",
    baseFileType: docxMimeType,
    baseFileDataUrl: `data:${docxMimeType};base64,AAAA`,
    basePreviewHtml: "Certificado {{nome}} {{COD}}",
    basePages: [
      {
        width: 1123,
        height: 794,
        orientation: "landscape",
        imageDataUrl: "data:image/png;base64,AAAA",
      },
    ],
    variableDefinitions: [
      { key: "cpf", label: "CPF", required: true },
    ],
    elements: [
      {
        id: "course",
        type: "text",
        content: "Curso {{curso}}",
      },
      {
        id: "name",
        type: "variable",
        content: "{{nome}}",
        variableKey: "nome",
        variableLabel: "Aluno",
        variableRequired: false,
      },
    ],
  }));

  assert.equal(layout.baseDocumentMode, "native");
  assert.deepEqual(layout.elements, []);
  assert.deepEqual(extractVariables(layout), [
    {
      key: "nome",
      label: "Aluno",
      required: false,
    },
    {
      key: "curso",
      label: "Curso",
      required: true,
    },
    {
      key: "cpf",
      label: "CPF",
      required: true,
    },
  ]);
});

test("legacy editable DOCX layouts with source file normalize to native base", () => {
  const layout = normalizeVisualDocxLayout(templateLayoutSchema.parse({
    baseDocumentMode: "editable",
    baseFileName: "modelo.docx",
    baseFileType: docxMimeType,
    baseFileDataUrl: `data:${docxMimeType};base64,AAAA`,
    elements: [
      {
        id: "name",
        type: "variable",
        content: "{{nome}}",
        variableKey: "nome",
        variableLabel: "Aluno",
        variableRequired: true,
      },
    ],
  }));

  assert.equal(layout.baseDocumentMode, "native");
  assert.deepEqual(layout.elements, []);
  assert.deepEqual(extractVariables(layout), [
    {
      key: "nome",
      label: "Aluno",
      required: true,
    },
  ]);
});

test("parses legacy text elements with typography defaults", () => {
  const layout = templateLayoutSchema.parse({
    elements: [
      {
        id: "legacy-text",
        type: "text",
        content: "Texto antigo",
      },
    ],
  });

  assert.equal(layout.elements[0].italic, false);
  assert.equal(layout.elements[0].underline, false);
  assert.equal(layout.elements[0].lineHeight, 1.15);
});

test("parses multipage template metadata and element page indexes", () => {
  const layout = templateLayoutSchema.parse({
    basePages: [
      { index: 0, width: 794, height: 1123, orientation: "portrait" },
      { index: 1, width: 794, height: 1123, orientation: "portrait" },
    ],
    elements: [
      {
        id: "page-2-name",
        type: "variable",
        content: "{{nome}}",
        pageIndex: 1,
      },
    ],
  });

  assert.equal(layout.basePages?.length, 2);
  assert.equal(layout.elements[0].pageIndex, 1);
});
