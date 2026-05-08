import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStaleBatchErrors,
  isBatchJobStale,
  STALE_BATCH_TIMEOUT_MS,
} from "../src/lib/batch-status";

test("detects stale batch jobs by updatedAt", () => {
  const now = new Date("2026-05-03T20:50:00.000Z");

  assert.equal(
    isBatchJobStale(new Date(now.getTime() - STALE_BATCH_TIMEOUT_MS - 1), now),
    true,
  );
  assert.equal(
    isBatchJobStale(new Date(now.getTime() - STALE_BATCH_TIMEOUT_MS + 1), now),
    false,
  );
});

test("preserves existing errors when marking a stale batch", () => {
  const errors = buildStaleBatchErrors({
    errors: ["Linha 1: erro"],
    processed: 1,
    total: 2,
  });

  assert.deepEqual(errors, [
    "Linha 1: erro",
    "Lote interrompido antes de terminar (1/2 processados). Gere o lote novamente.",
  ]);
});
