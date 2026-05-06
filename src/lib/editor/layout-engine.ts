/**
 * Layout Engine — Pure functions for pagination & coordinate math
 *
 * No React, no DOM. Operates purely on TemplateLayout data structures.
 * Used by the canvas component to compute where elements and pages render.
 */

import type { TemplateElement, TemplateLayout, TemplateLayoutPage } from "@/lib/certificate-layout";

/* ─── Page geometry ─── */

export interface PageGeometry {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageDataUrl?: string;
}

const PAGE_GAP = 32;

/**
 * Build the array of page rectangles for the canvas stack.
 * If `basePages` exist, each one becomes a page.
 * Otherwise, create a single page from the document dimensions.
 */
export function buildPageGeometries(
  layout: TemplateLayout,
  docWidth: number,
  docHeight: number,
): PageGeometry[] {
  const pages: PageGeometry[] = [];
  const basePages = layout.basePages ?? [];

  if (basePages.length > 0) {
    let offsetY = 0;
    for (let i = 0; i < basePages.length; i++) {
      const bp = basePages[i];
      const pw = docWidth;
      const ph = docHeight;
      pages.push({
        index: i,
        x: 0,
        y: offsetY,
        width: pw,
        height: ph,
        imageDataUrl: bp.imageDataUrl,
      });
      offsetY += ph + PAGE_GAP;
    }
  } else {
    pages.push({
      index: 0,
      x: 0,
      y: 0,
      width: docWidth,
      height: docHeight,
    });
  }

  return pages;
}

/**
 * Total bounding box of the canvas (all pages stacked vertically).
 */
export function canvasBounds(pages: PageGeometry[]) {
  if (pages.length === 0) return { width: 0, height: 0 };
  const maxW = Math.max(...pages.map((p) => p.width));
  const last = pages[pages.length - 1];
  const totalH = last.y + last.height;
  return { width: maxW, height: totalH };
}

/**
 * Get the page geometry for a given page index.
 */
export function getPageForIndex(pages: PageGeometry[], index: number): PageGeometry | undefined {
  return pages.find((p) => p.index === index);
}

/* ─── Element geometry helpers ─── */

/**
 * Filter elements that belong to a specific page.
 */
export function elementsOnPage(elements: TemplateElement[], pageIndex: number) {
  return elements.filter((el) => (el.pageIndex ?? 0) === pageIndex);
}

/**
 * Compute the absolute Y position of an element on the canvas,
 * accounting for page offsets.
 */
export function absoluteElementY(element: TemplateElement, pages: PageGeometry[]): number {
  const page = getPageForIndex(pages, element.pageIndex ?? 0);
  if (!page) return element.y;
  return page.y + element.y;
}

/**
 * Check if a point (in canvas coordinates) is inside an element.
 */
export function hitTest(
  px: number,
  py: number,
  element: TemplateElement,
  pages: PageGeometry[],
): boolean {
  const absY = absoluteElementY(element, pages);
  return (
    px >= element.x &&
    px <= element.x + element.width &&
    py >= absY &&
    py <= absY + element.height
  );
}

/* ─── Scale / Zoom ─── */

/**
 * Compute the zoom scale to fit a page within a given viewport.
 */
export function fitZoom(
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 48,
): number {
  const availW = viewportWidth - padding * 2;
  const availH = viewportHeight - padding * 2;
  if (availW <= 0 || availH <= 0) return 1;
  return Math.min(1, availW / pageWidth, availH / pageHeight);
}

/* ─── Variable helpers ─── */

const VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Extract all variable keys from a text string.
 */
export function extractKeysFromText(text: string): string[] {
  const keys: string[] = [];
  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const key = match[1].trim();
    if (key) keys.push(key);
  }
  return keys;
}

/**
 * Check if an element contains variable placeholders.
 */
export function hasVariables(element: TemplateElement): boolean {
  return VARIABLE_REGEX.test(element.content);
}
