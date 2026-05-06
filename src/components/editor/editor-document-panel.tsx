/**
 * EditorDocumentPanel — Left panel showing base document info
 *
 * Displays file name, type, page list, and document stats.
 * Only visible when a base document (DOCX/PDF) is loaded.
 */

"use client";

import { FileText, File } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";

export function EditorDocumentPanel() {
  const baseFileName = useEditorStore((s) => s.baseFileName);
  const baseFileType = useEditorStore((s) => s.baseFileType);
  const basePages = useEditorStore((s) => s.basePages);
  const elements = useEditorStore((s) => s.elements);
  const activePageIndex = useEditorStore((s) => s.activePageIndex);
  const setActivePageIndex = useEditorStore((s) => s.setActivePageIndex);

  if (!baseFileName) return null;

  const icon = baseFileType === "pdf" ? <File /> : <FileText />;
  const typeLabel =
    baseFileType === "pdf"
      ? "PDF"
      : baseFileType === "docx"
        ? "DOCX"
        : "Arquivo";

  return (
    <div className="te-document-panel">
      {/* File info */}
      <div className="te-docx-section">
        <div className="te-docx-heading">
          <div className="te-docx-icon">{icon}</div>
          <div>
            <strong>{baseFileName}</strong>
            <small>{typeLabel}</small>
          </div>
        </div>

        {/* Stats */}
        <div className="te-docx-stats" style={{ marginTop: "0.75rem" }}>
          <div>
            <strong>{basePages.length || 1}</strong>
            <span>Páginas</span>
          </div>
          <div>
            <strong>{elements.length}</strong>
            <span>Elementos</span>
          </div>
        </div>
      </div>

      {/* Page list */}
      {basePages.length > 1 && (
        <div className="te-docx-section">
          <div className="te-docx-section-title">Páginas</div>
          <div className="te-docx-page-list">
            {basePages.map((_, i) => {
              const count = elements.filter((el) => (el.pageIndex ?? 0) === i).length;
              return (
                <button
                  key={i}
                  className={`te-docx-page ${i === activePageIndex ? "active" : ""}`}
                  onClick={() => setActivePageIndex(i)}
                >
                  <span>Página {i + 1}</span>
                  <small>{count} elem.</small>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
