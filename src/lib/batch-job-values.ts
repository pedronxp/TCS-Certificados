const BATCH_JOB_VALUES_VERSION = 1;

export type BatchJobValues = {
  version: typeof BATCH_JOB_VALUES_VERSION;
  rows: Record<string, string>[];
  lineOffset: number;
};

export function buildBatchJobValues(rows: Record<string, string>[], lineOffset = 1): BatchJobValues {
  return {
    version: BATCH_JOB_VALUES_VERSION,
    rows,
    lineOffset: normalizeLineOffset(lineOffset),
  };
}

export function readBatchJobValues(value: unknown): BatchJobValues | null {
  if (!isRecord(value) || value.version !== BATCH_JOB_VALUES_VERSION || !Array.isArray(value.rows)) {
    return null;
  }

  const rows: Record<string, string>[] = [];
  for (const row of value.rows) {
    if (!isRecord(row)) return null;

    const normalizedRow: Record<string, string> = {};
    for (const [key, cellValue] of Object.entries(row)) {
      if (typeof cellValue !== "string") return null;
      normalizedRow[key] = cellValue;
    }

    rows.push(normalizedRow);
  }

  return {
    version: BATCH_JOB_VALUES_VERSION,
    rows,
    lineOffset: normalizeLineOffset(value.lineOffset),
  };
}

function normalizeLineOffset(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
