/**
 * PageNavigator — Navigate and manage pages
 */

"use client";

import { useEditorStore } from "@/stores/editor-store";

export function PageNavigator() {
  const basePages = useEditorStore((s) => s.basePages);
  const elements = useEditorStore((s) => s.elements);
  const activePageIndex = useEditorStore((s) => s.activePageIndex);
  const setActivePageIndex = useEditorStore((s) => s.setActivePageIndex);
  const width = useEditorStore((s) => s.width);
  const height = useEditorStore((s) => s.height);

  const pageCount = Math.max(1, basePages.length);
  const activePage = basePages[activePageIndex];
  const displayWidth = activePage?.width ?? width;
  const displayHeight = activePage?.height ?? height;

  return (
    <div className="te-panel">
      <div className="te-panel-title">Páginas</div>

      <div className="te-page-info">
        <strong>{pageCount}</strong>
        <span>{pageCount === 1 ? "página" : "páginas"}</span>
        <span style={{ marginLeft: "auto" }}>
          {displayWidth} x {displayHeight}
        </span>
      </div>

      {pageCount > 1 && (
        <div className="te-page-list">
          {Array.from({ length: pageCount }, (_, i) => {
            const count = elements.filter((el) => (el.pageIndex ?? 0) === i).length;
            return (
              <button
                key={i}
                className={`te-page-list-item ${i === activePageIndex ? "active" : ""}`}
                onClick={() => setActivePageIndex(i)}
              >
                <span>Página {i + 1}</span>
                <small>{count} {count === 1 ? "elemento" : "elementos"}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
