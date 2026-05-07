import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { extractPptxText, extractPptxVariableKeys } from "../src/lib/pptx-preview-service";

test("extracts PPTX text from a:t nodes without matching a:tile", async () => {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    [
      '<p:sld xmlns:p="p" xmlns:a="a">',
      "<a:tile></a:tile>",
      "<a:t>Certificado</a:t>",
      "<a:t>{{NOME}}</a:t>",
      "<a:t>{CPF}</a:t>",
      "</p:sld>",
    ].join(""),
  );
  const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));

  const text = await extractPptxText(buffer);

  assert.equal(text, "Certificado {{NOME}} {CPF}");
  assert.deepEqual(extractPptxVariableKeys(text), ["nome", "cpf"]);
});
