import assert from "node:assert/strict";
import { test } from "node:test";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import {
  renderCertificateHtml,
  renderDocxBuffer,
  renderNativeCertificateBuffer,
  renderPdfBuffer,
  renderPptxBuffer,
} from "../src/lib/render-certificate";

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

test("fills uppercase DOCX company placeholders from normalized values", async () => {
  const baseDocx = new Document({
    sections: [
      {
        children: [
          new Paragraph("Aluno {{NOME}}"),
          new Paragraph("Empresa {{EMPRESA}}"),
        ],
      },
    ],
  });
  const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

  const output = await renderDocxBuffer({
    template: {
      name: "NR 35",
      width: 595,
      height: 842,
      background: null,
      layout: {
        baseDocumentMode: "native",
        baseFileName: "NR 35.docx",
        baseFileType: docxMimeType,
        baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
        elements: [],
      },
    },
    values: {
      nome: "Ana Silva",
      empresa: "ACME Treinamentos",
    },
    verificationCode: "TCS-BR-2026-0035",
    appUrl: "http://localhost:3000",
  });

  const xml = new PizZip(output).file("word/document.xml")?.asText() ?? "";

  assert.match(xml, /Ana Silva/);
  assert.match(xml, /ACME Treinamentos/);
  assert.doesNotMatch(xml, /\{\{NOME\}\}/);
  assert.doesNotMatch(xml, /\{\{EMPRESA\}\}/);
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

test("fills uppercase visual variable elements from normalized values", async () => {
  const html = await renderCertificateHtml({
    template: {
      name: "Modelo",
      width: 1123,
      height: 794,
      background: null,
      layout: {
        elements: [
          {
            id: "company",
            type: "variable",
            content: "{{EMPRESA}}",
            variableKey: "EMPRESA",
          },
        ],
      },
    },
    values: { empresa: "ACME Treinamentos" },
    verificationCode: "TCS-BR-2026-0036",
    appUrl: "http://localhost:3000",
  });

  assert.match(html, /ACME Treinamentos/);
  assert.doesNotMatch(html, /\{\{EMPRESA\}\}/);
});

test("fills PPTX placeholders when generating native PPTX output", async () => {
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

  const input = {
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
  };
  const output = await renderPptxBuffer(input);
  const nativeOutput = await renderNativeCertificateBuffer(input);

  const zip = await JSZip.loadAsync(output);
  const xml = await zip.file("ppt/slides/slide1.xml")?.async("text") ?? "";

  assert.equal(nativeOutput.type, "PPTX");
  assert.equal(nativeOutput.extension, "pptx");
  assert.equal(nativeOutput.mimeType, pptxMimeType);
  assert.match(xml, /Maria Silva/);
  assert.match(xml, /123\.456\.789-00/);
  assert.match(xml, /TCS-BR-2026-0099/);
  assert.doesNotMatch(xml, /\{\{NOME\}\}/);
  assert.doesNotMatch(xml, /\{CPF\}/);
});

test("does not use static visual pages as final PDF for native DOCX when conversion is unavailable", async () => {
  const previousEnv = snapshotConverterEnv();
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const originalWarn = console.warn;
  console.warn = () => {};
  disableOfficeConverters();

  try {
    const baseDocx = new Document({
      sections: [
        {
          children: [
            new Paragraph("Aluno {{nome}}"),
            new Paragraph("Codigo {{COD}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    await assert.rejects(() => renderPdfBuffer({
      template: {
        name: "Modelo visual",
        width: 320,
        height: 180,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "modelo.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          baseImageDataUrl: pngDataUrl,
          basePages: [
            {
              index: 0,
              width: 320,
              height: 180,
              imageDataUrl: pngDataUrl,
            },
          ],
          elements: [
            {
              id: "nome",
              type: "variable",
              content: "{{nome}}",
              variableKey: "nome",
              x: 20,
              y: 20,
              width: 240,
              height: 40,
              fontSize: 18,
              fontFamily: "Arial",
              color: "#111827",
              align: "left",
            },
          ],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0100",
      appUrl: "http://localhost:3000",
    }), /Conversor Office para PDF indisponivel/);
  } finally {
    restoreConverterEnv(previousEnv);
    console.warn = originalWarn;
  }
});

test("does not render filled DOCX screenshot fallback as final PDF", async () => {
  const previousEnv = snapshotConverterEnv();
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const originalWarn = console.warn;
  console.warn = () => {};
  disableOfficeConverters();

  try {
    const baseDocx = new Document({
      sections: [
        {
          children: [
            new Paragraph("Aluno {{nome}}"),
            new Paragraph("Codigo {{COD}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));
    await assert.rejects(() => renderPdfBuffer({
      template: {
        name: "Suporte Basico de Vida V2",
        width: 794,
        height: 1123,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Suporte Basico de Vida V2.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          baseImageDataUrl: pngDataUrl,
          basePages: [
            {
              index: 0,
              width: 100,
              height: 100,
              imageDataUrl: pngDataUrl,
            },
          ],
          elements: [],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0101",
      appUrl: "http://localhost:3000",
    }), /Conversor Office para PDF indisponivel/);
  } finally {
    restoreConverterEnv(previousEnv);
    console.warn = originalWarn;
  }
});

test("keeps native DOCX PDF fidelity when only validation footer overflows to an extra page", async () => {
  const previousEnv = snapshotConverterEnv();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  console.warn = () => {};

  try {
    const nativePdf = await PDFDocument.create();
    const font = nativePdf.embedStandardFont(StandardFonts.Helvetica);
    const firstPage = nativePdf.addPage([595.3, 841.9]);
    firstPage.drawText("PDF nativo fiel ao DOCX", { x: 60, y: 600, size: 18, font });
    const overflowPage = nativePdf.addPage([595.3, 841.9]);
    overflowPage.drawText("Certificado valido apenas com a assinatura e CPF do aluno.", { x: 80, y: 740, size: 12, font });
    overflowPage.drawText("Numeracao:TCS-BR-2026-0200", { x: 180, y: 720, size: 12, font });
    configureMockGotenbergPdf(Buffer.from(await nativePdf.save()));

    const baseDocx = new Document({
      sections: [
        {
          children: [
            new Paragraph("Aluno {{nome}}"),
            new Paragraph("Codigo {{COD}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));
    const output = await renderPdfBuffer({
      template: {
        name: "Suporte Basico de Vida V2",
        width: 794,
        height: 1123,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Suporte Basico de Vida V2.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          baseImageDataUrl: pngDataUrl,
          basePages: [
            {
              index: 0,
              width: 794,
              height: 1123,
              imageDataUrl: pngDataUrl,
            },
          ],
          elements: [],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0200",
      appUrl: "http://localhost:3000",
    });

    const pdf = await PDFDocument.load(output);
    const size = pdf.getPage(0).getSize();
    const text = await extractPdfText(output);

    assert.equal(pdf.getPageCount(), 1);
    assert.ok(size.width > 590 && size.width < 600);
    assert.match(text, /PDF nativo fiel ao DOCX/);
    assert.match(text, /TCS-BR-2026-0200/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("compacts Curso de Formacao de Brigada Organica DOCX table before PDF conversion", async () => {
  const previousEnv = snapshotConverterEnv();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let uploadedDocumentXml = "";
  console.warn = () => {};

  try {
    const nativePdf = await PDFDocument.create();
    nativePdf.addPage([841.9, 595.3]);
    nativePdf.addPage([841.9, 595.3]);
    const nativePdfBuffer = Buffer.from(await nativePdf.save());

    process.env.NODE_ENV = "production";
    process.env.GOTENBERG_URL = "https://gotenberg.example.test";
    delete process.env.LIBREOFFICE_PATH;
    delete process.env.CLOUDCONVERT_API_KEY;
    delete process.env.CLOUDCONVERT_API_KEYS;
    delete process.env.CLOUDCONVERT_API_KEY_1;
    delete process.env.CLOUDCONVERT_API_KEY_2;
    delete process.env.CLOUDCONVERT_API_KEY_3;
    delete process.env.ILOVEAPI_PUBLIC_KEY;
    delete process.env.ILOVEAPI_PUBLIC_KEYS;
    delete process.env.ILOVEAPI_SECRET_KEY;
    delete process.env.ILOVEAPI_SECRET_KEYS;

    globalThis.fetch = (async (input, init) => {
      const url = String(input);

      if (url === "https://gotenberg.example.test/forms/libreoffice/convert") {
        assert.equal(init?.method, "POST");
        assert.ok(init?.body instanceof FormData);
        const file = init.body.get("files");
        assert.ok(file instanceof Blob);
        const uploadedBuffer = Buffer.from(await file.arrayBuffer());
        const zip = await JSZip.loadAsync(uploadedBuffer);
        uploadedDocumentXml = await zip.file("word/document.xml")?.async("text") ?? "";
        return new Response(nativePdfBuffer);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const baseDocx = new Document({
      sections: [
        {
          children: [
            new Paragraph("Aluno {{nome}}"),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Carlos Alexandre R. Faria Reg.MTE0056818/MG Coren MG 001.312.974 Reg. CBMMG Nº F 0004348",
                  size: 32,
                }),
              ],
            }),
            new Table({
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: "CONTEÚDO PROGRAMÁTICO", size: 24 })],
                        }),
                      ],
                    }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: "Linha extensa", size: 18 })],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Curso de Formacao de Brigada Organica",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Curso de Formacao de Brigada Organica.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
            { index: 2, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0300",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);
    const tableXml = uploadedDocumentXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0] ?? "";

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /Maria Silva/);
    assert.match(uploadedDocumentXml, /<w:keepLines\/>/);
    assert.match(uploadedDocumentXml, /w:line="190"/);
    assert.match(uploadedDocumentXml, /<w:pageBreakBefore\/>/);
    assert.match(tableXml, /w:val="20"/);
    assert.match(tableXml, /w:val="16"/);
    assert.doesNotMatch(tableXml, /w:val="24"/);
    assert.doesNotMatch(tableXml, /w:val="18"/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("rejects native DOCX PDF when converter returns incompatible size", async () => {
  const previousEnv = snapshotConverterEnv();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  console.warn = () => {};

  try {
    const nativePdf = await PDFDocument.create();
    nativePdf.addPage([100, 100]);
    configureMockGotenbergPdf(Buffer.from(await nativePdf.save()));

    const baseDocx = new Document({
      sections: [
        {
          children: [
            new Paragraph("Aluno {{nome}}"),
            new Paragraph("Codigo {{COD}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));
    await assert.rejects(() => renderPdfBuffer({
      template: {
        name: "Suporte Basico de Vida V2",
        width: 794,
        height: 1123,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Suporte Basico de Vida V2.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          baseImageDataUrl: pngDataUrl,
          basePages: [
            {
              index: 0,
              width: 794,
              height: 1123,
              imageDataUrl: pngDataUrl,
            },
          ],
          elements: [],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0102",
      appUrl: "http://localhost:3000",
    }), /Conversor Office para PDF indisponivel/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

async function extractPdfText(pdfBuffer: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), disableWorker: true }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item: { str?: string }) => item.str ?? "").join(" "));
  }

  return pages.join(" ");
}

function snapshotConverterEnv() {
  return {
    NODE_ENV: process.env.NODE_ENV,
    GOTENBERG_URL: process.env.GOTENBERG_URL,
    LIBREOFFICE_PATH: process.env.LIBREOFFICE_PATH,
    CLOUDCONVERT_API_KEY: process.env.CLOUDCONVERT_API_KEY,
    CLOUDCONVERT_API_KEYS: process.env.CLOUDCONVERT_API_KEYS,
    CLOUDCONVERT_API_KEY_1: process.env.CLOUDCONVERT_API_KEY_1,
    CLOUDCONVERT_API_KEY_2: process.env.CLOUDCONVERT_API_KEY_2,
    CLOUDCONVERT_API_KEY_3: process.env.CLOUDCONVERT_API_KEY_3,
    CLOUDCONVERT_API_BASE_URL: process.env.CLOUDCONVERT_API_BASE_URL,
    CLOUDCONVERT_SYNC_API_BASE_URL: process.env.CLOUDCONVERT_SYNC_API_BASE_URL,
    ILOVEAPI_PUBLIC_KEY: process.env.ILOVEAPI_PUBLIC_KEY,
    ILOVEAPI_PUBLIC_KEYS: process.env.ILOVEAPI_PUBLIC_KEYS,
    ILOVEAPI_PUBLIC_KEY_1: process.env.ILOVEAPI_PUBLIC_KEY_1,
    ILOVEAPI_PUBLIC_KEY_2: process.env.ILOVEAPI_PUBLIC_KEY_2,
    ILOVEAPI_PUBLIC_KEY_3: process.env.ILOVEAPI_PUBLIC_KEY_3,
    ILOVEAPI_SECRET_KEY: process.env.ILOVEAPI_SECRET_KEY,
    ILOVEAPI_SECRET_KEYS: process.env.ILOVEAPI_SECRET_KEYS,
    ILOVEAPI_SECRET_KEY_1: process.env.ILOVEAPI_SECRET_KEY_1,
    ILOVEAPI_SECRET_KEY_2: process.env.ILOVEAPI_SECRET_KEY_2,
    ILOVEAPI_SECRET_KEY_3: process.env.ILOVEAPI_SECRET_KEY_3,
    MICROSOFT_GRAPH_TENANT_ID: process.env.MICROSOFT_GRAPH_TENANT_ID,
    MICROSOFT_GRAPH_CLIENT_ID: process.env.MICROSOFT_GRAPH_CLIENT_ID,
    MICROSOFT_GRAPH_CLIENT_SECRET: process.env.MICROSOFT_GRAPH_CLIENT_SECRET,
    MICROSOFT_GRAPH_DRIVE_ID: process.env.MICROSOFT_GRAPH_DRIVE_ID,
    MICROSOFT_GRAPH_USER_ID: process.env.MICROSOFT_GRAPH_USER_ID,
  };
}

function disableOfficeConverters() {
  process.env.NODE_ENV = "production";
  delete process.env.GOTENBERG_URL;
  delete process.env.LIBREOFFICE_PATH;
  delete process.env.CLOUDCONVERT_API_KEY;
  delete process.env.CLOUDCONVERT_API_KEYS;
  delete process.env.CLOUDCONVERT_API_KEY_1;
  delete process.env.CLOUDCONVERT_API_KEY_2;
  delete process.env.CLOUDCONVERT_API_KEY_3;
  delete process.env.CLOUDCONVERT_API_BASE_URL;
  delete process.env.CLOUDCONVERT_SYNC_API_BASE_URL;
  delete process.env.ILOVEAPI_PUBLIC_KEY;
  delete process.env.ILOVEAPI_PUBLIC_KEYS;
  delete process.env.ILOVEAPI_PUBLIC_KEY_1;
  delete process.env.ILOVEAPI_PUBLIC_KEY_2;
  delete process.env.ILOVEAPI_PUBLIC_KEY_3;
  delete process.env.ILOVEAPI_SECRET_KEY;
  delete process.env.ILOVEAPI_SECRET_KEYS;
  delete process.env.ILOVEAPI_SECRET_KEY_1;
  delete process.env.ILOVEAPI_SECRET_KEY_2;
  delete process.env.ILOVEAPI_SECRET_KEY_3;
  delete process.env.MICROSOFT_GRAPH_TENANT_ID;
  delete process.env.MICROSOFT_GRAPH_CLIENT_ID;
  delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
  delete process.env.MICROSOFT_GRAPH_DRIVE_ID;
  delete process.env.MICROSOFT_GRAPH_USER_ID;
}

function restoreConverterEnv(env: ReturnType<typeof snapshotConverterEnv>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function configureMockGotenbergPdf(pdfBuffer: Buffer) {
  process.env.NODE_ENV = "production";
  process.env.GOTENBERG_URL = "https://gotenberg.example.test";
  delete process.env.LIBREOFFICE_PATH;
  delete process.env.CLOUDCONVERT_API_KEY;
  delete process.env.CLOUDCONVERT_API_KEYS;
  delete process.env.CLOUDCONVERT_API_KEY_1;
  delete process.env.CLOUDCONVERT_API_KEY_2;
  delete process.env.CLOUDCONVERT_API_KEY_3;
  delete process.env.CLOUDCONVERT_API_BASE_URL;
  delete process.env.CLOUDCONVERT_SYNC_API_BASE_URL;
  delete process.env.ILOVEAPI_PUBLIC_KEY;
  delete process.env.ILOVEAPI_PUBLIC_KEYS;
  delete process.env.ILOVEAPI_PUBLIC_KEY_1;
  delete process.env.ILOVEAPI_PUBLIC_KEY_2;
  delete process.env.ILOVEAPI_PUBLIC_KEY_3;
  delete process.env.ILOVEAPI_SECRET_KEY;
  delete process.env.ILOVEAPI_SECRET_KEYS;
  delete process.env.ILOVEAPI_SECRET_KEY_1;
  delete process.env.ILOVEAPI_SECRET_KEY_2;
  delete process.env.ILOVEAPI_SECRET_KEY_3;
  delete process.env.MICROSOFT_GRAPH_TENANT_ID;
  delete process.env.MICROSOFT_GRAPH_CLIENT_ID;
  delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
  delete process.env.MICROSOFT_GRAPH_DRIVE_ID;
  delete process.env.MICROSOFT_GRAPH_USER_ID;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);

    if (url === "https://gotenberg.example.test/forms/libreoffice/convert") {
      assert.equal(init?.method, "POST");
      assert.ok(init?.body instanceof FormData);
      return new Response(pdfBuffer);
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}
