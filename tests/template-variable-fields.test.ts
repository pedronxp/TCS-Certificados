import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatTemplateFieldValue,
  dedupeTemplateFieldVariables,
  getTemplateDocumentMode,
  getTemplateFieldMetadata,
  getTemplateVariableLabel,
  getTemplateVariablePlaceholder,
  mirrorTemplateFieldValues,
  validateTemplateFieldValue,
} from "../src/lib/template-variable-fields";

test("describes imported certificate variables with semantic labels", () => {
  assert.equal(getTemplateVariableLabel({ key: "id", label: "Id" }), "RG");
  assert.equal(getTemplateVariableLabel({ key: "uf", label: "Uf" }), "Estado (UF)");
  assert.equal(getTemplateVariableLabel({ key: "horas", label: "Horas" }), "Carga horaria");
  assert.equal(getTemplateVariableLabel({ key: "data_extenso", label: "Data por Extenso" }), "Data por Extenso");
});

test("uses helpful placeholders for certificate creation fields", () => {
  assert.equal(
    getTemplateVariablePlaceholder({ key: "id", label: "Id" }),
    "MG 12.345.678 ou 12.345.678",
  );
  assert.equal(
    getTemplateVariablePlaceholder({ key: "uf", label: "Uf" }),
    "MG",
  );
  assert.equal(
    getTemplateVariablePlaceholder({ key: "periodo", label: "Periodo" }),
    "setembro de 2019",
  );
});

test("classifies batch person fields without confusing carga horaria with RG", () => {
  assert.equal(getTemplateFieldMetadata({ key: "hora", label: "Carga horaria" }).kind, "hours");
  assert.equal(getTemplateFieldMetadata({ key: "horas", label: "Horas" }).perPerson, false);
  assert.equal(getTemplateFieldMetadata({ key: "id", label: "Id" }).kind, "rg");
  assert.equal(getTemplateFieldMetadata({ key: "uf", label: "Uf" }).perPerson, true);
});

test("formats and validates CPF, RG and UF fields", () => {
  assert.equal(getTemplateDocumentMode({ key: "cpf", label: "CPF" }), "CPF");
  assert.equal(formatTemplateFieldValue({ key: "cpf", label: "CPF" }, "12345678900"), "123.456.789-00");
  assert.equal(validateTemplateFieldValue({ key: "cpf", label: "CPF" }, "12345678900"), null);
  assert.match(validateTemplateFieldValue({ key: "cpf", label: "CPF" }, "123") ?? "", /11 digitos/);

  assert.equal(getTemplateDocumentMode({ key: "id", label: "Id" }), "RG");
  assert.equal(formatTemplateFieldValue({ key: "id", label: "Id" }, "mg 12.345.678"), "MG 12.345.678");
  assert.equal(validateTemplateFieldValue({ key: "uf", label: "Uf" }, "MG"), null);
  assert.match(validateTemplateFieldValue({ key: "uf", label: "Uf" }, "XX") ?? "", /UF/);
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
