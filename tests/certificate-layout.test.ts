import assert from "node:assert/strict";
import { test } from "node:test";
import { extractVariables, templateLayoutSchema } from "../src/lib/certificate-layout";

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
