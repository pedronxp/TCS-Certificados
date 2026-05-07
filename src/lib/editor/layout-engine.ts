/**
 * Layout Engine — Pure functions for pagination & coordinate math
 *
 * No React, no DOM. Operates purely on TemplateLayout data structures.
 * Used by the canvas component to compute where elements and pages render.
 */

import type { TemplateElement, TemplateLayout, TemplateLayoutPage, TemplatePageBorder } from "@/lib/certificate-layout";

/* ─── Page geometry ─── */

export interface PageGeometry {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageDataUrl?: string;
  border?: TemplatePageBorder;
}

const PAGE_GAP = 64;
const PDF_POINTS_TO_CSS_PIXELS = 4 / 3;

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
    const pageSizes = basePages.map((bp) => pageSizeFromBasePage(bp, docWidth, docHeight));
    const maxWidth = Math.max(...pageSizes.map((size) => size.width));
    let offsetY = 0;

    for (let i = 0; i < basePages.length; i++) {
      const bp = basePages[i];
      const { width: pw, height: ph } = pageSizes[i];
      pages.push({
        index: i,
        x: Math.round((maxWidth - pw) / 2),
        y: offsetY,
        width: pw,
        height: ph,
        imageDataUrl: bp.imageDataUrl,
        border: bp.border,
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
  const maxW = Math.max(...pages.map((p) => p.x + p.width));
  const last = pages[pages.length - 1];
  const totalH = last.y + last.height;
  return { width: maxW, height: totalH };
}

function pageSizeFromBasePage(
  page: TemplateLayoutPage,
  fallbackWidth: number,
  fallbackHeight: number,
) {
  const rawWidth = positivePageSize(page.width, fallbackWidth);
  const rawHeight = positivePageSize(page.height, fallbackHeight);
  const scaledWidth = Math.round(rawWidth * PDF_POINTS_TO_CSS_PIXELS);
  const scaledHeight = Math.round(rawHeight * PDF_POINTS_TO_CSS_PIXELS);

  if (
    closeTo(scaledWidth, fallbackWidth) &&
    closeTo(scaledHeight, fallbackHeight)
  ) {
    return { width: fallbackWidth, height: fallbackHeight };
  }

  return { width: rawWidth, height: rawHeight };
}

function positivePageSize(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

function closeTo(value: number, target: number) {
  const tolerance = Math.max(4, target * 0.03);
  return Math.abs(value - target) <= tolerance;
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
