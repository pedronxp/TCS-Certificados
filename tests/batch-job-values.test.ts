import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBatchJobValues, readBatchJobValues } from "../src/lib/batch-job-values";

test("stores batch rows with line offset metadata", () => {
  const values = buildBatchJobValues([{ nome: "Ana", empresa: "TCS" }], 2);

  assert.deepEqual(values, {
    version: 1,
    rows: [{ nome: "Ana", empresa: "TCS" }],
    lineOffset: 2,
  });
});

test("reads valid stored batch values", () => {
  const values = readBatchJobValues({
    version: 1,
    rows: [{ nome: "Ana" }, { nome: "Bruno" }],
    lineOffset: 3,
  });

  assert.deepEqual(values, {
    version: 1,
    rows: [{ nome: "Ana" }, { nome: "Bruno" }],
    lineOffset: 3,
  });
});

test("rejects legacy or malformed batch values", () => {
  assert.equal(readBatchJobValues({ nome: "Ana" }), null);
  assert.equal(readBatchJobValues({ version: 1, rows: [{ nome: 123 }], lineOffset: 2 }), null);
});

test("defaults invalid line offsets to the first data line", () => {
  assert.equal(buildBatchJobValues([], 0).lineOffset, 1);
  assert.equal(readBatchJobValues({ version: 1, rows: [], lineOffset: -5 })?.lineOffset, 1);
});
