import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBatchResultMessage } from "../src/lib/batch-result-message";

test("running batch message keeps the user on the processing tab", () => {
  assert.equal(
    buildBatchResultMessage({ status: "running", total: 3 }, 3),
    "Lote iniciado com 3 certificados. Mantenha esta aba aberta até a conclusão.",
  );
});

test("completed batch message summarizes success and row errors", () => {
  assert.equal(
    buildBatchResultMessage({ status: "completed", total: 3, created: 2, errors: ["Linha 3: erro"] }, 3),
    "Lote finalizado: 2/3 gerados e 1 com erro.",
  );
});

test("failed batch message returns the first fatal error", () => {
  assert.equal(
    buildBatchResultMessage({ status: "failed", errors: ["Lote interrompido."] }, 3),
    "Lote interrompido.",
  );
});
