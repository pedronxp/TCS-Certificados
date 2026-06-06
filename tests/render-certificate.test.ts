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

test("repairs DOCX placeholders with a missing opening delimiter", async () => {
  const baseDocx = new Document({
    sections: [
      {
        children: [
          new Paragraph("Assinatura {{NOME}}"),
        ],
      },
    ],
  });
  const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));
  const zip = new PizZip(baseBuffer);
  const documentXml = zip.file("word/document.xml")?.asText() ?? "";
  zip.file("word/document.xml", documentXml.replace("{{NOME}}", "{NOME}}"));
  const brokenBuffer = Buffer.from(zip.generate({ type: "nodebuffer" }));

  const output = await renderDocxBuffer({
    template: {
      name: "NR 18",
      width: 1123,
      height: 794,
      background: null,
      layout: {
        baseDocumentMode: "native",
        baseFileType: docxMimeType,
        baseFileDataUrl: `data:${docxMimeType};base64,${brokenBuffer.toString("base64")}`,
        elements: [],
      },
    },
    values: { NOME: "Giselle Dias da Silva" },
    verificationCode: "TCS-BR-2026-0001",
    appUrl: "http://localhost:3000",
  });

  const outputXml = new PizZip(output).file("word/document.xml")?.asText() ?? "";

  assert.match(outputXml, /Giselle Dias da Silva/);
  assert.doesNotMatch(outputXml, /\{NOME/);
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

test("renders Suporte Basico de Vida V2 controlled PDF with valid Portuguese accents", async () => {
  const previousEnv = snapshotConverterEnv();
  const originalWarn = console.warn;
  console.warn = () => {};
  disableOfficeConverters();

  try {
    const baseDocx = new Document({
      sections: [
        {
          children: [
            new Paragraph("CERTIFICADO"),
            new Paragraph("Curso de Suporte Básico de Vida"),
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
          basePages: [
            {
              index: 0,
              width: 794,
              height: 1123,
              border: { color: "#ff0000", width: 4 },
            },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Eliel Ribeiro Martins dos Santos",
        horas: "4",
        cidade: "Além Paraíba",
        data_extenso: "23 de maio de 2026",
      },
      verificationCode: "TCS-BR-2026-0998",
      appUrl: "http://localhost:3000",
    });

    const text = await extractPdfText(output);

    assert.match(text, /Suporte\s+Básico de Vida/);
    assert.match(text, /Cursos e Serviços/);
    assert.match(text, /ênfase em RCP/);
    assert.match(text, /Reanimação Cardiopulmonar/);
    assert.match(text, /Certificado válido apenas com a assinatura e CPF do aluno/);
    assert.match(text, /Numeração:TCS-BR-2026-0998/);
    assert.doesNotMatch(text, /BÃ|ServiÃ|ReanimaÃ|NumeraÃ|deliberaÃ/);
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

test("uses iLoveAPI when CloudConvert fails during native DOCX PDF conversion", async () => {
  const previousEnv = snapshotConverterEnv();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const calls: string[] = [];
  console.warn = () => {};

  try {
    const nativePdf = await PDFDocument.create();
    nativePdf.addPage([794, 1123]);
    const nativePdfBuffer = Buffer.from(await nativePdf.save());

    process.env.NODE_ENV = "production";
    delete process.env.GOTENBERG_URL;
    delete process.env.LIBREOFFICE_PATH;
    delete process.env.MICROSOFT_GRAPH_TENANT_ID;
    delete process.env.MICROSOFT_GRAPH_CLIENT_ID;
    delete process.env.MICROSOFT_GRAPH_CLIENT_SECRET;
    delete process.env.MICROSOFT_GRAPH_DRIVE_ID;
    delete process.env.MICROSOFT_GRAPH_USER_ID;
    process.env.CLOUDCONVERT_API_KEY = "cloudconvert-sem-credito";
    process.env.CLOUDCONVERT_API_BASE_URL = "https://cloudconvert.example.test/v2";
    process.env.CLOUDCONVERT_SYNC_API_BASE_URL = "https://sync-cloudconvert.example.test/v2";
    process.env.ILOVEAPI_PUBLIC_KEY = "public-ilove";
    process.env.ILOVEAPI_SECRET_KEY = "secret-ilove";
    process.env.ILOVEAPI_BASE_URL = "https://ilove.example.test/v1";

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://cloudconvert.example.test/v2/jobs") {
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer cloudconvert-sem-credito");
        return new Response(JSON.stringify({ message: "credits exceeded" }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://ilove.example.test/v1/start/officepdf/us") {
        const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "";
        const [, payload] = token.split(".");
        const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        assert.equal(decodedPayload.iss, "api.ilovepdf.com");
        assert.equal(decodedPayload.jti, "public-ilove");
        return new Response(JSON.stringify({ server: "ilove-worker.example.test", task: "task-1" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://ilove-worker.example.test/v1/upload") {
        assert.equal(init?.method, "POST");
        assert.ok(init?.body instanceof FormData);
        return new Response(JSON.stringify({ server_filename: "certificate.docx" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://ilove-worker.example.test/v1/process") {
        assert.equal(init?.method, "POST");
        assert.match(String(init?.body), /officepdf/);
        return new Response(JSON.stringify({ status: "TaskSuccess" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url === "https://ilove-worker.example.test/v1/download/task-1") {
        return new Response(nativePdfBuffer);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const baseDocx = new Document({
      sections: [{ children: [new Paragraph("Aluno {{nome}}")] }],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Curso de Atendimento Pre-Hospitalar",
        width: 794,
        height: 1123,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Curo de Atendimento Pre-Hospitalar.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [{ index: 0, width: 794, height: 1123 }],
          elements: [],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0400",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 1);
    assert.deepEqual(calls, [
      "https://cloudconvert.example.test/v2/jobs",
      "https://ilove.example.test/v1/start/officepdf/us",
      "https://ilove-worker.example.test/v1/upload",
      "https://ilove-worker.example.test/v1/process",
      "https://ilove-worker.example.test/v1/download/task-1",
    ]);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("compacts Curso de Atendimento Pre-Hospitalar program content before PDF conversion", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("Aluno {{nome}}"),
            new Paragraph({
              children: [new TextRun({ text: "CONTEÚDO PROGRAMÁTICO", size: 54 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "1- Aspectos legais e jurídicos; 2- Anatomia humana básica;", size: 32 })],
              spacing: { line: 240 },
            }),
            new Paragraph({
              children: [new TextRun({ text: "20-Resgate em áreas remotas / área de difícil acesso (simulado);", size: 32 })],
              spacing: { line: 240 },
            }),
            new Paragraph({
              children: [new TextRun({ text: "T.C.S CURSOS E SERVIÇOS CNPJ 32.340.932/0001-70", size: 24 })],
            }),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Curso de Atendimento Pre-Hospitalar",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Curo de Atendimento Pre-Hospitalar.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: { nome: "Maria Silva" },
      verificationCode: "TCS-BR-2026-0500",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /Maria Silva/);
    assert.match(uploadedDocumentXml, /w:after="240"/);
    assert.match(uploadedDocumentXml, /w:line="220"/);
    assert.match(uploadedDocumentXml, /w:before="760"/);
    assert.match(uploadedDocumentXml, /w:val="30"/);
    assert.match(uploadedDocumentXml, /w:val="22"/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("compacts Curso de Instrutor de Primeiros Socorros into two PDF pages", async () => {
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
            new Paragraph("A T.C.S Tico Cursos e Serviços, confere o presente certificado a Sr(a). {{NOME}} {{DOCUMENTO_PARTICIPANTE_TEXTO}}"),
            new Paragraph("Decreto 5.154/04 deliberação CEE 14/97 - Curso Livre de aperfeiçoamento Profissional."),
            new Paragraph("Cataguases, {{DATA_EXTENSO}}."),
            new Paragraph("Carlos Alexandre R. Faria Reg.MTE 0056818/MG Aluno (a) Coren MG 001.312.974 Reg. CBMMG Nº F 0004348"),
            new Paragraph({
              children: [new TextRun({ text: "CONTEÚDO PROGRAMÁTICO", size: 54 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Curso de Instrutor de Primeiros Socorros", size: 36 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Carga horária {{HORAS}} hrs.", size: 36 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "1. Conceito e Objetivo dos Primeiros Socorros; 17. Oficinas Práticas Orientadas", size: 32 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "T.C.S TICO CURSOS E SERVIÇOS RUA: ABÍLIO TAVARES PIRES Nº199", size: 32 })],
            }),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Curso de Instrutor de Primeiros Socorros",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Curso de Instrutor - Ajustado.docx",
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
      values: {
        NOME: "Maria Silva",
        DOCUMENTO_PARTICIPANTE_TEXTO: "portador(a) do doc. CPF 123.456.789-00",
        DATA_EXTENSO: "15 de maio de 2026",
        HORAS: "80",
      },
      verificationCode: "TCS-BR-2026-0600",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /Maria Silva/);
    assert.match(uploadedDocumentXml, /w:line="205"/);
    assert.match(uploadedDocumentXml, /w:line="238"/);
    assert.match(uploadedDocumentXml, /w:before="460"/);
    assert.match(uploadedDocumentXml, /w:jc w:val="center"/);
    assert.match(uploadedDocumentXml, /w:val="31"/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps Curso NR 12 Motosserra e Rocadeira program content on page two", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("NR 12 - Seguranca no Trabalho de Maquinas e Equipamentos"),
            new Paragraph("Certifica que o Sr(a). {{nome}}, portador(a) do {{doc}}, foi submetido(a) e aprovado(a)."),
            new Paragraph("Cataguases, {{data_extenso}}."),
            new Paragraph("Carlos Alexandre R. Faria Reg.MTE0056818/MG Aluno"),
            new Paragraph({
              children: [new TextRun({ text: "CONTEUDO PROGRAMATICO", size: 46 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Treinamento de Seguranca nos Trabalhos com Motosserra e Rocadeira", size: 36 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Principios e Objetivos; Termos e Definicoes; Definicoes finais;", size: 24 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "T.C.S CURSOS E SERVICOS CNPJ 32.340.932/0001-70", size: 24 })],
            }),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Curso NR 12 Motosserra e Rocadeira",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Curso NR 12 Motosserra e Rocadeira.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Maria Silva",
        doc: "CPF 123.456.789-00",
        data_extenso: "15 de maio de 2026",
      },
      verificationCode: "TCS-BR-2026-0700",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /Maria Silva/);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /w:before="2850"/);
    assert.match(uploadedDocumentXml, /w:jc w:val="center"/);
    assert.match(uploadedDocumentXml, /Reg\.MTE 0056818\/MG/);
    assert.match(uploadedDocumentXml, /Princ\S+pios e Objetivos/);
    assert.match(uploadedDocumentXml, /Defini\S+es finais/);
    assert.doesNotMatch(uploadedDocumentXml, /Reg\.MTE0056818\/MG/);
    assert.doesNotMatch(uploadedDocumentXml, /Emprego-\s*MTE/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps NR 06 certificate in two pages with corrected title and body spacing", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("CURSO DE FORMAÇÃO DE BRIGADA ORGÂNICA NÍVEL BÁSICO"),
            new Paragraph("A T.C.S Cursos e Serviços confere que Sr.(a) {{NOME}} realizadono dia {{DATA_EXTENSO}}."),
            new Paragraph("Cataguases, {{DATA_EXTENSO}}."),
            new Paragraph("Carlos Alexandre R. Faria Reg.MTE0056818/MG Aluno"),
            new Paragraph({
              children: [new TextRun({ text: "CONTEÚDO PROGRAMÁTICO", size: 46 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Curso de Equipamentos de Proteção Individual Carga horária", size: 36 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Orientações, obrigações e responsabilidades; Tipos de EPI; Uso e conservação;", size: 24 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "T.C.S CURSOS E SERVIÇOS CNPJ 32.340.932/0001-70", size: 24 })],
            }),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "NR 06",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Modelo certificado NR 06.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        NOME: "Maria Silva",
        DATA_EXTENSO: "15 de maio de 2026",
      },
      verificationCode: "TCS-BR-2026-0800",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /CURSO DE EQUIPAMENTOS DE PROTE/);
    assert.doesNotMatch(uploadedDocumentXml, /BRIGADA ORG/);
    assert.match(uploadedDocumentXml, /realizado no/);
    assert.doesNotMatch(uploadedDocumentXml, /realizadono/);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /w:line="215"/);
    assert.match(uploadedDocumentXml, /w:before="2200"/);
    assert.match(uploadedDocumentXml, /w:jc w:val="center"/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps NR 31 program content cleaned and inside two pages", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("CURSO DE NR31"),
            new Paragraph("Certifica que o Sr(a). {{nome}}, portador(a) do CPF {{cpf}}, concluiu o curso."),
            new Paragraph("CONTEÚDO PROGRAMÁTICO"),
            new Paragraph("Curso de Formação de Brigada Carga horária {{horas}}hrs"),
            new Paragraph("Riscos físicos, químicos e biológicos"),
            new Paragraph("Ergonomia"),
            new Paragraph("Equipamentos de Proteção Individual (EPI)Riscos físicos, químicos e biológicos"),
            new Paragraph("•Ergonomia"),
            new Paragraph("•Equipamentos de Proteção Individual (EPI)"),
            new Paragraph("T.C.S CURSOS E SERVIÇOS CNPJ 32.340.932/0001-70     RUA: ABÍLIO TAVARES PIRES Nº199     Numeração: {{doc}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "NR 31",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "NR 31.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Maria Silva",
        cpf: "123.456.789-00",
        doc: "CPF 123.456.789-00",
        horas: "8",
      },
      verificationCode: "TCS-BR-2026-0831",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /Curso de NR31 Carga hor/);
    assert.doesNotMatch(uploadedDocumentXml, /Curso de Formação de Brigada/);
    assert.doesNotMatch(uploadedDocumentXml, /EPI\)Riscos/);
    assert.match(uploadedDocumentXml, /w:before="420"/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps NR 18 program content starting on page two", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("Certificamos que {{nome}}, portador do CPF {{cpf}} concluiu o curso de NR 18."),
            new Paragraph("Carlos Alexandre R. Faria {NOME}}"),
            new Paragraph("CONTEÚDO PROGRAMÁTICO"),
            new Paragraph("NR 18 – Capacitação Básica em Segurança do Trabalho na Construção Civil"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "NR18",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "NR18.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Maria Silva",
        cpf: "123.456.789-00",
      },
      verificationCode: "TCS-BR-2026-0818",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.doesNotMatch(uploadedDocumentXml, /\{NOME\}\}/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps Retroescavadeira program content on page two without stray dot", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("Certifica que o Sr(a). {{nome}} concluiu o treinamento de Retroescavadeira."),
            new Paragraph("CONTEÚDO PROGRAMÁTICO"),
            new Paragraph("Seguraça e ambiente de trabalho"),
            new Paragraph("."),
            new Paragraph("T.C.S CURSOS E SERVIÇOS CNPJ 32.340.932/0001-70 Numeração: {{COD}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Retroescavadeira",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Retroescavadeira.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Maria Silva",
      },
      verificationCode: "TCS-BR-2026-0889",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /Segurança e ambiente/);
    assert.doesNotMatch(uploadedDocumentXml, />\.<\/w:t>/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("normalizes Combate a Incendios Florestais text and starts program content on page two", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("CURSO DE PREVENÇÃO ECOMBATEA INCÊNDIOS FLORESTAIS E PRIMEIROS SOCORROS"),
            new Paragraph(
              "Certifica que o Sr(a).{{nome}},portador do CPF {{cpf}} foi aprovado no Curso de Prevençãoe Combate a Incêndio Florestal, com enfase em Primeiros Socorros, realizado no {{DATA_EXTENSO}} na cidade de {{CIDADE}} - {{UF}}.",
            ),
            new Paragraph("Cataguases,15 de maio de 2026."),
            new Paragraph({
              children: [
                new TextRun("Carlos Alexandre R. Faria"),
                new TextRun("."),
                new TextRun(" Reg. CBMMG Nº F 000434"),
                new TextRun(";"),
              ],
            }),
            new Paragraph("."),
            new Paragraph(";"),
            new Paragraph("CONTEÚDO PROGRAMÁTICO"),
            new Paragraph("Primeiros Socorros"),
            new Paragraph("T.C.S CURSOS E SERVIÇOS CNPJ 32.340.932/0001-70 Numeração: {{DOC}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Combate a Incêndios Florestais e Primeiros Socorros",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Modelo COMBATE A INCÊNDIOS FLORESTAIS E PRIMEIROS SOCORROS.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Maria Silva",
        cpf: "123.456.789-00",
        DATA_EXTENSO: "15 de maio de 2026",
        CIDADE: "Cataguases",
        UF: "MG",
      },
      verificationCode: "TCS-BR-2026-0900",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /w:after="240"/);
    assert.match(uploadedDocumentXml, /w:line="275"/);
    assert.match(uploadedDocumentXml, /w:before="260"/);
    assert.match(uploadedDocumentXml, /PREVEN\S+O E COMBATE A INC\S+NDIOS/);
    assert.doesNotMatch(uploadedDocumentXml, /ECOMBATEA/);
    assert.match(uploadedDocumentXml, /Sr\(a\)\. Maria Silva, portador/);
    assert.match(uploadedDocumentXml, /Preven\S+o e Combate/);
    assert.match(uploadedDocumentXml, /Cataguases, 15 de maio/);
    assert.match(uploadedDocumentXml, /TCS-BR-2026-0900/);
    assert.doesNotMatch(uploadedDocumentXml, />\.<\/w:t>/);
    assert.doesNotMatch(uploadedDocumentXml, />;<\/w:t>/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("normalizes Curso de SBV content before native PDF conversion", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("A {{EMPRESA}}, confere o presente certificado ao(à) Sr(a). {{NOME}}, portador(a) do CPF {{CPF}}, aprovado(a) no Curso de BLS - Suporte Básico de Vida."),
            new Paragraph("{{CIDADE}} , {{DATA_EXTENSO}}."),
            new Paragraph("CONTEÚDO PROGRAMÁTICO"),
            new Paragraph("Curso de BLS – Suporte Básico de Vida"),
            new Paragraph("Carga horária {{HORAS}} hrs."),
            new Paragraph("7. Avaliação inicial,Avaliação primária e avaliação secundária;"),
            new Paragraph("9. PCR, RCP , OVACE e A.V.E;"),
            new Paragraph("10. Oficinas Práticas Orientadas"),
            new Paragraph("."),
            new Paragraph("T.C.S CURSOS E SERVIÇOS CNPJ 32.340.932/0001-70, Numeração: {{DOC}}"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Curso de SBV",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Curso de SBV.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        EMPRESA: "Otten Engenharia",
        NOME: "Maria Silva",
        CPF: "123.456.789-00",
        CIDADE: "Cataguases",
        DATA_EXTENSO: "15 de maio de 2026",
        HORAS: "8",
      },
      verificationCode: "TCS-BR-2026-0910",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /Cataguases, 15 de maio de 2026/);
    assert.match(uploadedDocumentXml, /Avalia\S+o inicial, Avalia\S+o/);
    assert.match(uploadedDocumentXml, /8\. PCR, RCP, OVACE/);
    assert.match(uploadedDocumentXml, /9\. Oficinas/);
    assert.match(uploadedDocumentXml, /w:line="1120"/);
    assert.match(uploadedDocumentXml, /Numera\S+o: TCS-BR-2026-0910/);
    assert.doesNotMatch(uploadedDocumentXml, />\.<\/w:t>/);
    assert.doesNotMatch(uploadedDocumentXml, /CNPJ 32\.340\.932\/0001-70, Numera/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("normalizes NR 35 Portuguese text and keeps the native PDF to two pages", async () => {
  const previousEnv = snapshotConverterEnv();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let uploadedDocumentXml = "";
  console.warn = () => {};

  try {
    const nativePdf = await PDFDocument.create();
    nativePdf.addPage([841.9, 595.3]);
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("Certifica que o Sr(a). {{nome}}, portador do CPF {{cpf}} por ter submetido e aprovado em treinamento, teórico e prático para Trabalho em Altura."),
            new Paragraph("Conforme determina o ministério do Trabalho e Emprego- MTE."),
            new Paragraph("CONTEÚDO PROGRAMÁTICO"),
            new Paragraph("Curso de Trabalho em altura – NR-35 horária {{horas}} hrs"),
            new Paragraph("Acidentes típicos em trabalhos altura;"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "NR 35",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "NR 35.docx",
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
      values: {
        nome: "Maria Silva",
        cpf: "123.456.789-00",
        horas: "8",
      },
      verificationCode: "TCS-BR-2026-0835",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /CPF 123\.456\.789-00, por ter participado e sido aprovado\(a\)/);
    assert.match(uploadedDocumentXml, /treinamento teórico/);
    assert.match(uploadedDocumentXml, /Ministério do Trabalho e Emprego - MTE/);
    assert.match(uploadedDocumentXml, /NR-35 Carga horária 8 hrs/);
    assert.match(uploadedDocumentXml, /trabalhos em altura/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps NR 20 program content legible on page two", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("Curso de NR 20 - Seguranca e Saude no Trabalho com Inflamaveis e Combustivel"),
            new Paragraph("Confere que o Sr(a) {{NOME}}, portador do CPF {{CPF}}, concluiu o curso com carga horaria de {{HORAS}} horas."),
            new Paragraph("Carlos Alexandre R. Faria {{NOME}} Reg.MTE0056818/MG Aluno Coren MG 001.312.974"),
            new Paragraph("CONTEUDO PROGRAMATICO"),
            new Paragraph("Carga horaria: {{HORA}} horas"),
            new Paragraph("1. Inflamaveis: caracteristicas, propriedades, perigos e riscos;"),
            new Paragraph("2. Controles coletivo e individual para trabalhos com inflamaveis;"),
            new Paragraph("3. Fontes de ignicao e seu controle;"),
            new Paragraph("4. Protecao contra incendio com inflamaveis;"),
            new Paragraph("5. Procedimentos em situacoes de emergencia com inflamaveis;"),
            new Paragraph("6. Estudo da Norma Regulamentadora n. 20;"),
            new Paragraph("7. Analise Preliminar de Perigos/Riscos: conceitos e exercicios praticos;"),
            new Paragraph("8. Permissao para Trabalho com Inflamaveis."),
            new Paragraph("Conhecimentos e utilizacao dos sistemas de seguranca contra incendio com inflamaveis."),
            new Paragraph("T.C.S CURSOS E SERVICOS CNPJ 32.340.932/0001-70 RUA: ABILIO TAVARES PIRES N 199 BAIRRO: CENTENARIO CIDADE: CATAGUASES - M. G CEL: (32) 99996-7877"),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "NR 20",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "NR 20..docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        NOME: "Maria Silva",
        CPF: "123.456.789-00",
        HORAS: "16",
        HORA: "16",
      },
      verificationCode: "TCS-BR-2026-0920",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /w:line="310"/);
    assert.match(uploadedDocumentXml, /w:after="100"/);
    assert.match(uploadedDocumentXml, /w:before="2200"/);
    assert.match(uploadedDocumentXml, /w:color w:val="000000"/);
    assert.match(uploadedDocumentXml, /w:rFonts w:ascii="Times New Roman"/);
    assert.match(uploadedDocumentXml, /Reg\.MTE 0056818\/MG/);
    assert.doesNotMatch(uploadedDocumentXml, /Reg\.MTE0056818\/MG/);
  } finally {
    restoreConverterEnv(previousEnv);
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("keeps Guindauto footer inside the two-page PDF", async () => {
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
            new Paragraph("CERTIFICADO"),
            new Paragraph("Seguranca na Operacao de Guindauto"),
            new Paragraph("Certifica que o Sr(a). {{nome}}, portador(a) do {{doc}}, foi submetido(a) e aprovado(a)."),
            new Paragraph("Cataguases, {{data_extenso}}."),
            new Paragraph("Carlos Alexandre R. Faria Reg.MTE0056818/MG Aluno"),
            new Paragraph("Coren MG 001.312.974 Reg. De CFC 40436"),
            new Paragraph({
              children: [new TextRun({ text: "CONTEUDO PROGRAMATICO", size: 46 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Lei 6.514/77 e Portaria 3.214/78", size: 30 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Instrutor: Carlos Alexandre Rodrigues Faria", size: 30 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "Media Aprovacao - 9,5", size: 36 })],
            }),
            new Paragraph({
              children: [new TextRun({ text: "T.C.S CURSOS E SERVICOS CNPJ 32.340.932/0001-70", size: 24 })],
            }),
          ],
        },
      ],
    });
    const baseBuffer = Buffer.from(await Packer.toBuffer(baseDocx));

    const output = await renderPdfBuffer({
      template: {
        name: "Guindauto",
        width: 1123,
        height: 794,
        background: null,
        layout: {
          baseDocumentMode: "native",
          baseFileName: "Guindauto.docx",
          baseFileType: docxMimeType,
          baseFileDataUrl: `data:${docxMimeType};base64,${baseBuffer.toString("base64")}`,
          basePages: [
            { index: 0, width: 1123, height: 794 },
            { index: 1, width: 1123, height: 794 },
          ],
          elements: [],
        },
      },
      values: {
        nome: "Maria Silva",
        doc: "CPF 123.456.789-00",
        data_extenso: "15 de maio de 2026",
      },
      verificationCode: "TCS-BR-2026-0800",
      appUrl: "http://localhost:3000",
    });

    const outputPdf = await PDFDocument.load(output);

    assert.equal(outputPdf.getPageCount(), 2);
    assert.match(uploadedDocumentXml, /Maria Silva/);
    assert.match(uploadedDocumentXml, /w:pageBreakBefore/);
    assert.match(uploadedDocumentXml, /w:after="1200"/);
    assert.match(uploadedDocumentXml, /w:before="1500"/);
    assert.match(uploadedDocumentXml, /w:jc w:val="center"/);
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
    ILOVEAPI_BASE_URL: process.env.ILOVEAPI_BASE_URL,
    ILOVEAPI_REGION: process.env.ILOVEAPI_REGION,
    ILOVEAPI_TIMEOUT_MS: process.env.ILOVEAPI_TIMEOUT_MS,
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
  delete process.env.ILOVEAPI_BASE_URL;
  delete process.env.ILOVEAPI_REGION;
  delete process.env.ILOVEAPI_TIMEOUT_MS;
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
