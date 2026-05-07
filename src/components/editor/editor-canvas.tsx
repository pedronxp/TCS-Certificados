/**
 * EditorCanvas — Central canvas area for the template editor
 *
 * Renders pages with background images and overlaid elements.
 * Supports zoom via Ctrl+Scroll and click-to-deselect on empty space.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Layers } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { useCanvasInteraction } from "@/hooks/use-canvas-interaction";
import { buildPageGeometries, canvasBounds, elementsOnPage } from "@/lib/editor/layout-engine";
import { isPdfDataUrl } from "@/lib/pdf-preview.client";
import { CanvasElement } from "./canvas-element";

export function EditorCanvas() {
  const elements = useEditorStore((s) => s.elements);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);
  const zoom = useEditorStore((s) => s.zoom);
  const selectedId = useEditorStore((s) => s.selectedId);
  const inlineEditId = useEditorStore((s) => s.inlineEditId);
  const activePageIndex = useEditorStore((s) => s.activePageIndex);
  const background = useEditorStore((s) => s.background);
  const baseDocumentMode = useEditorStore((s) => s.baseDocumentMode);
  const basePages = useEditorStore((s) => s.basePages);
  const baseRenderDataUrl = useEditorStore((s) => s.baseRenderDataUrl);
  const baseImageDataUrl = useEditorStore((s) => s.baseImageDataUrl);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setActivePageIndex = useEditorStore((s) => s.setActivePageIndex);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const initialZoomSet = useRef(false);
  const lastAutoFitKey = useRef("");
  const interaction = useCanvasInteraction();

  /* Page geometry — built from basePages (stable ref from store) */
  const pages = useMemo(
    () => buildPageGeometries({ basePages, elements: [] }, width, height),
    [basePages, width, height],
  );
  const bounds = useMemo(() => canvasBounds(pages), [pages]);
  const fitPage = pages[activePageIndex] ?? pages[0];
  const autoFitKey = fitPage ? `${pages.length}:${fitPage.width}:${fitPage.height}` : "";

  /* ─── Auto-fit Zoom on Mount ─── */
  useEffect(() => {
    if (!containerRef.current || !fitPage) return;
    if (initialZoomSet.current && lastAutoFitKey.current === autoFitKey) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        initialZoomSet.current = true;
        lastAutoFitKey.current = autoFitKey;
        const paddingW = 120; // 60px on each side
        const paddingH = 80;  // 40px top/bottom

        const scaleX = (width - paddingW) / fitPage.width;
        const scaleY = (height - paddingH) / fitPage.height;
        const bestFit = Math.min(scaleX, scaleY);

        // Limit to 100% max, round to 2 decimal places
        const scale = Math.round(Math.max(0.2, Math.min(1.0, bestFit)) * 100) / 100;
        setZoom(scale);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [autoFitKey, fitPage, setZoom]);

  /* ─── Scroll to Active Page ─── */
  useEffect(() => {
    const el = pageRefs.current[activePageIndex];
    if (el && containerRef.current) {
      // Small timeout to allow render before scroll
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }, 50);
    }
  }, [activePageIndex]);

  /* Ctrl+Scroll zoom */
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      setZoom(zoom + delta);
    },
    [zoom, setZoom],
  );

  /* Click on empty space → deselect */
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("te-page-frame")) {
        clearSelection();
      }
    },
    [clearSelection],
  );

  /* Resolve background for a page: page image → global render → global image → background */
  const rasterRenderDataUrl = baseRenderDataUrl && !isPdfDataUrl(baseRenderDataUrl)
    ? baseRenderDataUrl
    : null;
  const docxFallbackBg = baseImageDataUrl || rasterRenderDataUrl || null;
  const hasPendingPdfBackground = isPdfDataUrl(baseRenderDataUrl);
  const showBaseBackground = baseDocumentMode !== "editable";

  return (
    <div
      ref={containerRef}
      className="te-canvas-area"
      onWheel={handleWheel}
      onClick={handleBackgroundClick}
    >
      <div className="te-canvas-wrapper" style={{ width: bounds.width * zoom, height: bounds.height * zoom }}>
        <div className="te-page-stack" style={{ width: bounds.width, height: bounds.height, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
          {pages.map((page) => {
            const pageElements = elementsOnPage(elements, page.index);
            const isActive = page.index === activePageIndex;
            const bg = showBaseBackground
              ? page.imageDataUrl || (page.index === 0 ? (background || docxFallbackBg) : docxFallbackBg) || undefined
              : page.index === 0 ? background || undefined : undefined;

            return (
              <div
                key={page.index}
                ref={(el) => {
                  pageRefs.current[page.index] = el;
                }}
                className={`te-page-frame ${isActive ? "te-page-active" : ""}`}
                style={{
                  left: page.x,
                  top: page.y,
                  width: page.width,
                  height: page.height,
                  backgroundImage: bg ? `url("${bg}")` : undefined,
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
                onClick={() => setActivePageIndex(page.index)}
              >
                {/* Page label */}
                {pages.length > 1 && (
                  <span className="te-page-label">Página {page.index + 1}</span>
                )}

                {page.border && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: page.border.inset,
                      border: `${page.border.width}px solid ${page.border.color}`,
                      pointerEvents: "none",
                      zIndex: 6,
                    }}
                  />
                )}

                {/* Fallback when no content */}
                {pageElements.length === 0 && !bg && (
                  <div className="te-page-fallback">
                    <Layers />
                    <span>{hasPendingPdfBackground ? "Renderizando pagina" : "Adicione elementos a pagina"}</span>
                  </div>
                )}

                {/* Elements */}
                {pageElements.map((el) => (
                  <CanvasElement
                    key={el.id}
                    element={el}
                    isSelected={selectedId === el.id}
                    isEditing={inlineEditId === el.id}
                    onDragStart={interaction.startDrag}
                    onDragMove={interaction.moveDrag}
                    onDragEnd={interaction.endDrag}
                    onResizeStart={interaction.startResize}
                    onResizeMove={interaction.moveResize}
                    onResizeEnd={interaction.endResize}
                    onDoubleClick={interaction.handleDoubleClick}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
