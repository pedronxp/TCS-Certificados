import { DATE_FIELD_KEYS } from "@/lib/date-fields";
import {
  formatTemplateFieldValue,
  getTemplateDuplicateKey,
  getTemplateFieldAliases,
  getTemplateVariableLabel,
  isTemplateBatchPersonField,
  isTemplateRecipientField,
  isTemplateVariableRequired,
  mirrorTemplateFieldValues,
  validateTemplateFieldValue,
} from "@/lib/template-variable-fields";

export type BatchCertificateVariable = {
  key: string;
  label: string;
  required: boolean;
};

const companyColumns = ["empresa", "company"];
const dateColumns = [...DATE_FIELD_KEYS];

export function normalizeBatchRowsForTemplate(
  rows: Record<string, string>[],
  variables: BatchCertificateVariable[],
) {
  return rows.map((row) => {
    const normalizedRow = { ...row };

    for (const variable of variables) {
      const value = findValueForVariable(row, variable);
      if (value) {
        normalizedRow[variable.key] = formatTemplateFieldValue(variable, value);
      }
    }

    return mirrorTemplateFieldValues(variables, normalizedRow);
  });
}

export function validateBatchTemplateSupport(variables: BatchCertificateVariable[]) {
  const personVariables = variables.filter(isTemplateBatchPersonField);
  if (!personVariables.length || !personVariables.some(isTemplateRecipientField)) {
    return "Este modelo precisa de um campo de aluno/nome para emissão em lote.";
  }

  return null;
}

export function validateBatchTemplateRows(
  rows: Record<string, string>[],
  variables: BatchCertificateVariable[],
  lineOffset: number,
) {
  const seen = new Map<string, number>();

  for (const [index, row] of rows.entries()) {
    const line = index + normalizeLineOffset(lineOffset);

    for (const variable of variables) {
      const value = String(row[variable.key] ?? "").trim();
      const label = getTemplateVariableLabel(variable);

      if (isTemplateVariableRequired(variable) && !value) {
        return `Linha ${line}: informe ${label}.`;
      }

      const validationError = validateTemplateFieldValue(variable, value);
      if (validationError) {
        return `Linha ${line}: ${label} inválido. ${validationError}`;
      }

      if (isTemplateBatchPersonField(variable)) {
        const duplicateKey = getTemplateDuplicateKey(variable, value);
        if (duplicateKey) {
          const firstLine = seen.get(duplicateKey);
          if (firstLine) {
            return `Linha ${line}: ${label} duplicado da linha ${firstLine}.`;
          }

          seen.set(duplicateKey, line);
        }
      }
    }
  }

  return null;
}

export function validateSingleCompanyAndDate(rows: Record<string, string>[], lineOffset: number) {
  const firstLine = normalizeLineOffset(lineOffset);
  const companyColumn = findColumn(rows, companyColumns);
  const dateColumn = findColumn(rows, dateColumns);

  if (!companyColumn) {
    return 'Inclua uma coluna "empresa" na planilha para emissão em lote.';
  }

  if (!dateColumn) {
    return 'Inclua uma coluna "data" na planilha para emissão em lote.';
  }

  const firstCompany = normalizeComparableValue(rows[0][companyColumn]);
  const firstDate = normalizeComparableValue(rows[0][dateColumn]);

  if (!firstCompany) {
    return `Linha ${firstLine}: informe a empresa.`;
  }

  if (!firstDate) {
    return `Linha ${firstLine}: informe a data.`;
  }

  for (const [index, row] of rows.entries()) {
    const line = index + firstLine;
    const company = normalizeComparableValue(row[companyColumn]);
    const date = normalizeComparableValue(row[dateColumn]);

    if (!company) {
      return `Linha ${line}: informe a empresa.`;
    }

    if (!date) {
      return `Linha ${line}: informe a data.`;
    }

    if (company !== firstCompany) {
      return `Linha ${line}: a empresa deve ser igual em todo o lote.`;
    }

    if (date !== firstDate) {
      return `Linha ${line}: a data deve ser igual em todo o lote.`;
    }
  }

  return null;
}

export function normalizeBatchHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findValueForVariable(row: Record<string, string>, variable: BatchCertificateVariable) {
  for (const alias of getTemplateFieldAliases(variable)) {
    const value = findColumnValue(row, alias);
    if (value.trim()) return value;
  }

  return "";
}

function findColumnValue(row: Record<string, string>, alias: string) {
  const normalizedAlias = normalizeBatchHeader(alias);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeBatchHeader(key) === normalizedAlias) {
      return String(value ?? "").trim();
    }
  }

  return "";
}

function findColumn(rows: Record<string, string>[], aliases: string[]) {
  const headers = Object.keys(rows[0] ?? {});
  const normalizedAliases = new Set(aliases.map(normalizeBatchHeader));
  return headers.find((header) => normalizedAliases.has(normalizeBatchHeader(header)));
}

function normalizeComparableValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeLineOffset(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}
