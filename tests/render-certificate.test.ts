import assert from "node:assert/strict";
import { test } from "node:test";
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import PizZip from "pizzip";
import { renderCertificateHtml, renderDocxBuffer } from "../src/lib/render-certificate";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pptxMimeType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

test("fills DOCX validation code placeholders with the full verification code", async () => {
  const baseDocx = new Document({
    sections: [
      {
        children: [
          new Paragraph("Codigo {{COD}} {{codigo}}"),
          new Paragraph("Numeração - {{CÓD}}"),
          new Paragraph("Validacao {{Código de Validação}}"),
        ],
      },
    ],
  });
  const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

  const output = await renderDocxBuffer({
    template: {
      name: "Modelo",
      width: 1123,
      height: 794,
      background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          elements: [],
        },
      },
    values: {},
    verificationCode: "TCS-BR-2026-0001",
    appUrl: "http://localhost:3000",
  });

  const xml = new PizZip(output).file("word/document.xml")?.asText() ?? "";
  const fullCodeMatches = xml.match(/TCS-BR-2026-0001/g) ?? [];

  assert.equal(fullCodeMatches.length, 4);
  assert.doesNotMatch(xml, />0001</);
  assert.doesNotMatch(xml, /undefined/);
});

test("renders multiline styled text consistently in certificate HTML", async () => {
  const html = await renderCertificateHtml({
    template: {
      name: "Modelo",
      width: 1123,
      height: 794,
      background: null,
      layout: {
        elements: [
          {
            id: "body",
            type: "text",
            content: "Linha 1\nAluno: {{nome}}",
            x: 80,
            y: 90,
            width: 420,
            height: 120,
            fontSize: 24,
            fontFamily: "Georgia",
            color: "#123456",
            align: "left",
            bold: true,
            italic: true,
            underline: true,
            lineHeight: 1.5,
          },
        ],
      },
    },
    values: { nome: "Maria" },
    verificationCode: "TCS-BR-2026-0002",
    appUrl: "http://localhost:3000",
  });

  assert.match(html, /Linha 1\nAluno: Maria/);
  assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /word-break:break-word/);
  assert.match(html, /font-style:italic/);
  assert.match(html, /text-decoration:underline/);
  assert.match(html, /line-height:1.5/);
});

test("fills PPTX placeholders when generating the fallback DOCX", async () => {
  const basePptx = new JSZip();
  basePptx.file(
    "ppt/slides/slide1.xml",
    [
      '<p:sld xmlns:p="p" xmlns:a="a">',
      "<a:t>Aluno {{NOME}}</a:t>",
      "<a:t>Documento {CPF}</a:t>",
      "<a:t>Codigo {{COD}}</a:t>",
      "</p:sld>",
    ].join(""),
  );
  const baseBuffer = Buffer.from(await basePptx.generateAsync({ type: "nodebuffer" }));

  const output = await renderDocxBuffer({
    template: {
      name: "Rapel",
      width: 1280,
      height: 720,
      background: null,
      layout: {
        baseDocumentMode: "native",
        baseFileName: "Rapel.pptx",
        baseFileType: pptxMimeType,
        baseFileDataUrl: `data:${pptxMimeType};base64,${baseBuffer.toString("base64")}`,
        elements: [],
      },
    },
    values: {
      nome: "Maria Silva",
      cpf: "123.456.789-00",
    },
    verificationCode: "TCS-BR-2026-0099",
    appUrl: "http://localhost:3000",
  });

  const xml = new PizZip(output).file("word/document.xml")?.asText() ?? "";

  assert.match(xml, /Maria Silva/);
  assert.match(xml, /123\.456\.789-00/);
  assert.match(xml, /TCS-BR-2026-0099/);
  assert.doesNotMatch(xml, /\{\{NOME\}\}/);
  assert.doesNotMatch(xml, /\{CPF\}/);
});
