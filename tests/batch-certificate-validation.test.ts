import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeBatchRowsForTemplate,
  validateBatchTemplateRows,
  validateBatchTemplateSupport,
  validateSingleCompanyAndDate,
} from "../src/lib/batch-certificate-validation";

const variables = [
  { key: "nome", label: "Nome", required: true },
  { key: "cpf", label: "CPF", required: true },
  { key: "empresa", label: "Empresa", required: true },
  { key: "data", label: "Data", required: true },
  { key: "mes", label: "Mês", required: false },
];

test("normalizes manual batch rows with shared field formatting", () => {
  const rows = normalizeBatchRowsForTemplate(
    [
      {
        nome: "Ana Silva",
        cpf: "12345678900",
        empresa: "TCS",
        data: "19 de maio de 2026",
        mes: "05",
      },
    ],
    variables,
  );

  assert.deepEqual(rows, [
    {
      nome: "Ana Silva",
      cpf: "123.456.789-00",
      empresa: "TCS",
      data: "19 de maio de 2026",
      mes: "maio",
    },
  ]);
});

test("validates manual rows with first UI line offset", () => {
  const rows = [{ nome: "Ana Silva", cpf: "123.456.789-00", empresa: "", data: "19 de maio de 2026" }];

  assert.equal(validateSingleCompanyAndDate(rows, 1), "Linha 1: informe a empresa.");
});

test("validates spreadsheet rows with header offset and duplicate detection", () => {
  const rows = [
    { nome: "Ana Silva", cpf: "123.456.789-00", empresa: "TCS", data: "19 de maio de 2026" },
    { nome: "Bruno Silva", cpf: "123.456.789-00", empresa: "TCS", data: "19 de maio de 2026" },
  ];

  assert.equal(
    validateBatchTemplateRows(rows, variables, 2),
    "Linha 3: CPF duplicado da linha 2.",
  );
});

test("allows empty CPF when the template still marks CPF as required", () => {
  const rows = [
    { nome: "Ana Silva", cpf: "", empresa: "TCS", data: "19 de maio de 2026" },
  ];

  assert.equal(validateBatchTemplateRows(rows, variables, 1), null);
});

test("allows empty DOC for templates using calculated document text", () => {
  const instructorVariables = [
    { key: "nome", label: "Nome", required: true },
    { key: "doc", label: "DOC", required: true },
    { key: "documento_participante_texto", label: "Documento Participante Texto", required: true },
    { key: "horas", label: "Horas", required: true },
    { key: "carga_horaria_com_unidade", label: "Carga Horaria Com Unidade", required: true },
    { key: "complemento_carga_horaria", label: "Complemento Carga Horaria", required: true },
    { key: "empresa", label: "Empresa", required: true },
    { key: "data", label: "Data", required: true },
  ];
  const rows = [
    { nome: "Ana Silva", doc: "", horas: "40", empresa: "TCS", data: "19 de maio de 2026" },
  ];

  assert.equal(validateBatchTemplateRows(rows, instructorVariables, 1), null);
});

test("rejects templates without a recognizable recipient field", () => {
  assert.equal(
    validateBatchTemplateSupport([{ key: "empresa", label: "Empresa", required: true }]),
    "Este modelo precisa de um campo de aluno/nome para emissão em lote.",
  );
});
