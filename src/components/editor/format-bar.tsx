/**
 * FormatBar — Text formatting controls (Bold, Italic, Underline, Alignment, Font, Size)
 */

"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import type { TemplateElement } from "@/lib/certificate-layout";

const FONT_OPTIONS = [
  "Arial",
  "Arial Narrow",
  "Calibri",
  "Cambria",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Tahoma",
  "Impact",
  "Courier New",
] as const;
const LINE_HEIGHT_OPTIONS = [1, 1.15, 1.3, 1.5, 1.8, 2] as const;

interface FormatBarProps {
  element: TemplateElement;
}

export function FormatBar({ element }: FormatBarProps) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const pushHistory = useEditorStore((s) => s.pushHistory);

  function toggle(field: "bold" | "italic" | "underline") {
    pushHistory();
    updateElement(element.id, { [field]: !element[field] });
  }

  function setAlign(align: "left" | "center" | "right") {
    pushHistory();
    updateElement(element.id, { align });
  }

  return (
    <div className="te-prop-section">
      <div className="te-prop-section-title">Formatação</div>

      {/* Style toggles */}
      <div className="te-format-bar">
        <button className={`te-format-btn ${element.bold ? "active" : ""}`} onClick={() => toggle("bold")} title="Negrito">
          <Bold />
        </button>
        <button className={`te-format-btn ${element.italic ? "active" : ""}`} onClick={() => toggle("italic")} title="Itálico">
          <Italic />
        </button>
        <button className={`te-format-btn ${element.underline ? "active" : ""}`} onClick={() => toggle("underline")} title="Sublinhado">
          <Underline />
        </button>

        <span style={{ width: 1, height: "1.25rem", background: "var(--border-muted)", margin: "0 0.15rem" }} />

        <button className={`te-format-btn ${element.align === "left" ? "active" : ""}`} onClick={() => setAlign("left")} title="Alinhar à esquerda">
          <AlignLeft />
        </button>
        <button className={`te-format-btn ${element.align === "center" ? "active" : ""}`} onClick={() => setAlign("center")} title="Centralizar">
          <AlignCenter />
        </button>
        <button className={`te-format-btn ${element.align === "right" ? "active" : ""}`} onClick={() => setAlign("right")} title="Alinhar à direita">
          <AlignRight />
        </button>
      </div>

      {/* Font & Size */}
      <div className="te-prop-grid" style={{ marginTop: "0.625rem" }}>
        <div className="field">
          <span>Fonte</span>
          <select
            value={element.fontFamily}
            onChange={(e) => {
              pushHistory();
              updateElement(element.id, { fontFamily: e.target.value });
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <span>Tamanho</span>
          <input
            type="number"
            min={8}
            max={200}
            value={element.fontSize}
            onChange={(e) => {
              pushHistory();
              updateElement(element.id, { fontSize: Number(e.target.value) || 28 });
            }}
          />
        </div>
        <div className="field">
          <span>Cor</span>
          <input
            type="color"
            value={element.color}
            onChange={(e) => {
              pushHistory();
              updateElement(element.id, { color: e.target.value });
            }}
          />
        </div>
        <div className="field">
          <span>Entrelinhas</span>
          <select
            value={element.lineHeight}
            onChange={(e) => {
              pushHistory();
              updateElement(element.id, { lineHeight: Number(e.target.value) });
            }}
          >
            {LINE_HEIGHT_OPTIONS.map((lh) => (
              <option key={lh} value={lh}>{lh}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
