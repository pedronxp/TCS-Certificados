import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPageGeometries, canvasBounds } from "../src/lib/editor/layout-engine";

test("uses base page dimensions and keeps different-width pages centered", () => {
  const pages = buildPageGeometries({
    elements: [],
    basePages: [
      { index: 0, width: 600, height: 800, orientation: "portrait" },
      { index: 1, width: 400, height: 800, orientation: "portrait" },
    ],
  }, 1123, 794);

  assert.deepEqual(pages.map(({ x, y, width, height }) => ({ x, y, width, height })), [
    { x: 0, y: 0, width: 600, height: 800 },
    { x: 100, y: 864, width: 400, height: 800 },
  ]);
  assert.deepEqual(canvasBounds(pages), { width: 600, height: 1664 });
});

test("normalizes legacy PDF point-sized pages to the document pixel size", () => {
  const pages = buildPageGeometries({
    elements: [],
    basePages: [
      { index: 0, width: 842, height: 595, orientation: "landscape" },
      { index: 1, width: 842, height: 595, orientation: "landscape" },
    ],
  }, 1123, 794);

  assert.deepEqual(pages.map(({ x, y, width, height }) => ({ x, y, width, height })), [
    { x: 0, y: 0, width: 1123, height: 794 },
    { x: 0, y: 858, width: 1123, height: 794 },
  ]);
});
