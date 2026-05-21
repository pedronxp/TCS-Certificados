import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCalculatedTemplateValues,
  formatTemplateFieldValue,
  dedupeTemplateFieldVariables,
  getTemplateDocumentMode,
  getTemplateFieldMetadata,
  getTemplateVariableDefaultRequired,
  getTemplateVariableLabel,
  getTemplateVariablePlaceholder,
  isTemplateVariableRequired,
  mirrorTemplateFieldValues,
  validateTemplateFieldValue,
} from "../src/lib/template-variable-fields";

test("describes imported certificate variables with semantic labels", () => {
  assert.equal(getTemplateVariableLabel({ key: "id", label: "Id" }), "RG");
  assert.equal(getTemplateVariableLabel({ key: "uf", label: "Uf" }), "Estado (UF)");
  assert.equal(getTemplateVariableLabel({ key: "horas", label: "Horas" }), "Carga horária");
  assert.equal(getTemplateVariableLabel({ key: "data_extenso", label: "Data por Extenso" }), "Data por Extenso");
  assert.equal(getTemplateVariableLabel({ key: "mes", label: "Mes" }), "Mês");
});

test("uses helpful placeholders for certificate creation fields", () => {
  assert.equal(
    getTemplateVariablePlaceholder({ key: "id", label: "Id" }),
    "MG 12.345.678 ou 12.345.678-9",
  );
  assert.equal(
    getTemplateVariablePlaceholder({ key: "uf", label: "Uf" }),
    "MG",
  );
  assert.equal(
    getTemplateVariablePlaceholder({ key: "periodo", label: "Periodo" }),
    "setembro de 2019",
  );
  assert.equal(
    getTemplateVariablePlaceholder({ key: "mes", label: "Mes" }),
    "maio",
  );
});

test("classifies batch person fields without confusing carga horária with RG", () => {
  assert.equal(getTemplateFieldMetadata({ key: "hora", label: "Carga horária" }).kind, "hours");
  assert.equal(getTemplateFieldMetadata({ key: "horas", label: "Horas" }).perPerson, false);
  assert.equal(getTemplateFieldMetadata({ key: "id", label: "Id" }).kind, "rg");
  assert.equal(getTemplateFieldMetadata({ key: "uf", label: "Uf" }).perPerson, true);
});

test("formats and validates CPF, RG and UF fields", () => {
  assert.equal(getTemplateDocumentMode({ key: "cpf", label: "CPF" }), "CPF");
  assert.equal(formatTemplateFieldValue({ key: "cpf", label: "CPF" }, "12345678900"), "123.456.789-00");
  assert.equal(validateTemplateFieldValue({ key: "cpf", label: "CPF" }, "12345678900"), null);
  assert.match(validateTemplateFieldValue({ key: "cpf", label: "CPF" }, "123") ?? "", /11 dígitos/);

  assert.equal(getTemplateDocumentMode({ key: "id", label: "Id" }), "RG");
  assert.equal(formatTemplateFieldValue({ key: "id", label: "Id" }, "mg 12.345.678"), "MG 12.345.678");
  assert.equal(formatTemplateFieldValue({ key: "id", label: "Id" }, "MG265265265"), "MG 26.526.526-5");
  assert.equal(formatTemplateFieldValue({ key: "rg", label: "RG" }, "123456789"), "12.345.678-9");
  assert.equal(formatTemplateFieldValue({ key: "rg", label: "RG" }, "12345678X"), "12.345.678-X");
  assert.equal(validateTemplateFieldValue({ key: "uf", label: "Uf" }, "MG"), null);
  assert.match(validateTemplateFieldValue({ key: "uf", label: "Uf" }, "XX") ?? "", /UF/);
});

test("treats CPF as optional even when old templates mark it required", () => {
  assert.equal(getTemplateVariableDefaultRequired({ key: "cpf", label: "CPF" }), false);
  assert.equal(isTemplateVariableRequired({ key: "cpf", label: "CPF", required: true }), false);
  assert.equal(isTemplateVariableRequired({ key: "doc", label: "Doc", required: true }), false);
  assert.equal(isTemplateVariableRequired({ key: "nome", label: "Nome", required: true }), true);
});

test("calculates document phrase and hours with unit variables", () => {
  const variables = [
    { key: "nome", label: "Nome" },
    { key: "doc", label: "DOC" },
    { key: "horas", label: "Horas" },
    { key: "data_extenso", label: "Data por Extenso" },
    { key: "documento_participante_texto", label: "Documento Participante Texto" },
    { key: "carga_horaria_com_unidade", label: "Carga Horaria Com Unidade" },
    { key: "complemento_carga_horaria", label: "Complemento Carga Horaria" },
  ];

  assert.deepEqual(
    applyCalculatedTemplateValues(variables, {
      nome: "Ana",
      doc: "12345678900",
      horas: "40",
      data_extenso: "2 de maio de 2026",
    }),
    {
      nome: "Ana",
      doc: "12345678900",
      horas: "40",
      data_extenso: "2 de maio de 2026",
      documento_participante_texto: ", portador(a) do CPF 123.456.789-00",
      carga_horaria_com_unidade: "40 horas",
      complemento_carga_horaria: ", distribuída nos dias 2, 3, 4, 5 e 6 de maio de 2026",
    },
  );

  assert.deepEqual(
    applyCalculatedTemplateValues(variables, {
      nome: "Ana",
      doc: "",
      horas: "1",
      data_extenso: "2 de maio de 2026",
    }),
    {
      nome: "Ana",
      doc: "",
      horas: "1",
      data_extenso: "2 de maio de 2026",
      documento_participante_texto: "",
      carga_horaria_com_unidade: "1 hora",
      complemento_carga_horaria: "",
    },
  );
});

test("calculates hours distribution from period when start date is not available", () => {
  const variables = [
    { key: "horas", label: "Horas" },
    { key: "periodo", label: "Periodo" },
    { key: "periodo_carga_horaria", label: "Periodo Carga Horaria" },
  ];

  assert.deepEqual(
    applyCalculatedTemplateValues(variables, {
      horas: "12",
      periodo: "maio de 2026",
    }),
    {
      horas: "12",
      periodo: "maio de 2026",
      periodo_carga_horaria: ", distribuída nos dias 1 e 2 de maio de 2026",
    },
  );
});

test("calculates hours distribution across month boundaries", () => {
  const variables = [
    { key: "horas", label: "Horas" },
    { key: "data_extenso", label: "Data por Extenso" },
    { key: "complemento_carga_horaria", label: "Complemento Carga Horaria" },
  ];

  assert.equal(
    applyCalculatedTemplateValues(variables, {
      horas: "40",
      data_extenso: "30 de maio de 2026",
    }).complemento_carga_horaria,
    ", distribuída nos dias 30 de maio de 2026, 31 de maio de 2026, 1 de junho de 2026, 2 de junho de 2026 e 3 de junho de 2026",
  );
});

test("formats period fields as month and year", () => {
  assert.equal(
    formatTemplateFieldValue({ key: "periodo", label: "Periodo" }, "2019-09"),
    "setembro de 2019",
  );
  assert.equal(
    formatTemplateFieldValue({ key: "periodo", label: "Periodo" }, "01/09/2019"),
    "setembro de 2019",
  );
});

test("formats month fields as month names", () => {
  assert.equal(getTemplateFieldMetadata({ key: "mes", label: "MES" }).kind, "month");
  assert.equal(formatTemplateFieldValue({ key: "mes", label: "MES" }, "5"), "maio");
  assert.equal(formatTemplateFieldValue({ key: "mes", label: "MES" }, "05"), "maio");
  assert.equal(formatTemplateFieldValue({ key: "mes", label: "MES" }, "2026-05"), "maio");
  assert.equal(formatTemplateFieldValue({ key: "mes", label: "MES" }, "08/05/2026"), "maio");
});

test("mirrors equivalent fields such as nome/aluno and hora/horas", () => {
  const variables = [
    { key: "nome", label: "Nome" },
    { key: "aluno", label: "Aluno" },
    { key: "horas", label: "Horas" },
    { key: "hora", label: "Hora" },
  ];

  assert.deepEqual(mirrorTemplateFieldValues(variables, { nome: "Ana", horas: "16" }), {
    nome: "Ana",
    horas: "16",
    aluno: "Ana",
    hora: "16",
  });
  assert.deepEqual(dedupeTemplateFieldVariables(variables).map((variable) => variable.key), [
    "nome",
    "horas",
  ]);
});
