/**
 * EditorToolbar — Top bar with document info, actions, and zoom controls
 */

"use client";

import { useCallback, useState } from "react";
import { FilePenLine, FileText, Minus, PanelLeft, Plus, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";

interface EditorToolbarProps {
  onSave: () => void;
}

export function EditorToolbar({ onSave }: EditorToolbarProps) {
  const name = useEditorStore((s) => s.name);
  const orientation = useEditorStore((s) => s.orientation);
  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const id = useEditorStore((s) => s.id);
  const baseDocumentMode = useEditorStore((s) => s.baseDocumentMode);
  const baseFileType = useEditorStore((s) => s.baseFileType);
  const zoom = useEditorStore((s) => s.zoom);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const zoomIn = useEditorStore((s) => s.zoomIn);
  const zoomOut = useEditorStore((s) => s.zoomOut);
  const resetZoom = useEditorStore((s) => s.resetZoom);

  const [navOpen, setNavOpen] = useState(false);
  const canOpenDocxEditor = Boolean(
    id &&
      baseDocumentMode === "native" &&
      baseFileType?.includes("wordprocessingml"),
  );

  const toggleNav = useCallback(() => {
    setNavOpen((prev) => {
      const next = !prev;
      document.body.classList.toggle("te-sidebar-visible", next);
      return next;
    });
  }, []);

  return (
    <div className="te-toolbar">
      {/* ─── Navigation toggle ─── */}
      <button
        className={`te-nav-toggle ${navOpen ? "active" : ""}`}
        onClick={toggleNav}
        title={navOpen ? "Esconder menu" : "Mostrar menu"}
        aria-label="Alternar menu de navegação"
      >
        <PanelLeft />
      </button>

      {/* ─── Document identity ─── */}
      <div className="te-toolbar-heading">
        <span className="te-toolbar-icon">
          <FileText />
        </span>
        <span>
          <strong>{name || "Sem nome"}</strong>
          <small>{orientation === "landscape" ? "A4 paisagem" : "A4 retrato"}</small>
        </span>
      </div>

      <div className="te-toolbar-spacer" />

      {/* ─── Dirty badge ─── */}
      {isDirty && (
        <span className="te-unsaved-badge">Não salvo</span>
      )}

      <div className="te-toolbar-divider" />

      {/* ─── Undo / Redo ─── */}
      <div className="te-toolbar-group">
        <button
          className="te-btn te-btn-icon"
          onClick={undo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
          aria-label="Desfazer"
        >
          <Undo2 />
        </button>
        <button
          className="te-btn te-btn-icon"
          onClick={redo}
          disabled={!canRedo}
          title="Refazer (Ctrl+Shift+Z)"
          aria-label="Refazer"
        >
          <Redo2 />
        </button>
      </div>

      <div className="te-toolbar-divider" />

      {/* ─── Zoom controls ─── */}
      <div className="te-toolbar-group">
        <button className="te-btn te-btn-icon" onClick={zoomOut} title="Reduzir zoom" aria-label="Reduzir zoom">
          <Minus />
        </button>
        <button className="te-btn" onClick={resetZoom} title="Resetar zoom" style={{ minWidth: "3.5rem" }}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="te-btn te-btn-icon" onClick={zoomIn} title="Aumentar zoom" aria-label="Aumentar zoom">
          <Plus />
        </button>
      </div>

      <div className="te-toolbar-divider" />

      {canOpenDocxEditor && (
        <>
          <button
            className="te-btn"
            onClick={() => {
              window.location.href = `/modelos/${id}/office`;
            }}
            title="Abrir no editor DOCX LibreOffice"
          >
            <FilePenLine />
            Editar DOCX
          </button>
          <div className="te-toolbar-divider" />
        </>
      )}

      {/* ─── Save ─── */}
      <button
        className="te-btn te-btn-primary"
        onClick={onSave}
        disabled={isSaving || !isDirty}
      >
        {isSaving ? (
          <RotateCcw style={{ animation: "spin 1s linear infinite" }} />
        ) : (
          <Save />
        )}
        {isSaving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
