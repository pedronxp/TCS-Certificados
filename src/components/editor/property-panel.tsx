/**
 * PropertyPanel — Properties for the selected element
 *
 * Shows position/size, content editing, and format controls.
 */

"use client";

import { Copy, Trash2 } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { FormatBar } from "./format-bar";

export function PropertyPanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const elements = useEditorStore((s) => s.elements);
  const updateElement = useEditorStore((s) => s.updateElement);
  const removeElement = useEditorStore((s) => s.removeElement);
  const duplicateElement = useEditorStore((s) => s.duplicateElement);
  const pushHistory = useEditorStore((s) => s.pushHistory);

  const element = elements.find((el) => el.id === selectedId);

  if (!element) {
    return (
      <div className="te-panel" style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
        Selecione um elemento no canvas para editar suas propriedades.
      </div>
    );
  }

  return (
    <div className="te-panel">
      {/* Header with actions */}
      <div className="te-element-actions">
        <span className="te-element-actions-title">
          {element.type === "text" ? "Texto" : element.type === "variable" ? "Variável" : element.type === "qr" ? "QR Code" : "Imagem"}
        </span>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <button
            className="te-btn te-btn-icon"
            onClick={() => { pushHistory(); duplicateElement(element.id); }}
            title="Duplicar (Ctrl+D)"
          >
            <Copy />
          </button>
          <button
            className="te-btn te-btn-icon te-btn-danger"
            onClick={() => { pushHistory(); removeElement(element.id); }}
            title="Excluir (Delete)"
          >
            <Trash2 />
          </button>
        </div>
      </div>

      {/* Position & Size */}
      <div className="te-prop-section">
        <div className="te-prop-section-title">Posição e tamanho</div>
        <div className="te-prop-grid">
          {(["x", "y", "width", "height"] as const).map((field) => (
            <div key={field} className="field">
              <span>{field === "x" ? "X" : field === "y" ? "Y" : field === "width" ? "Largura" : "Altura"}</span>
              <input
                type="number"
                value={element[field]}
                onChange={(e) => {
                  pushHistory();
                  updateElement(element.id, { [field]: Number(e.target.value) || 0 });
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Content (for text/variable) */}
      {(element.type === "text" || element.type === "variable") && (
        <div className="te-prop-section">
          <div className="te-prop-section-title">Conteúdo</div>
          <textarea
            className="te-var-input"
            style={{ width: "100%", minHeight: "4rem", resize: "vertical", padding: "0.5rem" }}
            value={element.content}
            onChange={(e) => {
              pushHistory();
              updateElement(element.id, { content: e.target.value });
            }}
          />
        </div>
      )}

      {/* Variable metadata */}
      {element.type === "variable" && (
        <div className="te-prop-section">
          <div className="te-prop-section-title">Variável</div>
          <div className="te-prop-grid">
            <div className="field">
              <span>Chave</span>
              <input
                type="text"
                value={element.variableKey ?? ""}
                onChange={(e) => {
                  pushHistory();
                  updateElement(element.id, { variableKey: e.target.value });
                }}
              />
            </div>
            <div className="field">
              <span>Rótulo</span>
              <input
                type="text"
                value={element.variableLabel ?? ""}
                onChange={(e) => {
                  pushHistory();
                  updateElement(element.id, { variableLabel: e.target.value });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Format bar */}
      {(element.type === "text" || element.type === "variable") && (
        <FormatBar element={element} />
      )}
    </div>
  );
}
