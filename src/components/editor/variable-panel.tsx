/**
 * VariablePanel — Variable management panel
 *
 * Lists all variables found in elements, allows adding new ones.
 * Quick-insert variable chips for the active element.
 */

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/stores/editor-store";
import { normalizeVariableKey } from "@/lib/certificate-layout";
import { getTemplateVariableDefaultRequired } from "@/lib/template-variable-fields";
import type { TemplateElement } from "@/lib/certificate-layout";

export function VariablePanel() {
  const elements = useEditorStore((s) => s.elements);
  const addElement = useEditorStore((s) => s.addElement);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const activePageIndex = useEditorStore((s) => s.activePageIndex);
  const [newLabel, setNewLabel] = useState("");

  /* Collect all unique variable keys */
  const variableElements = elements.filter(
    (el) => el.type === "variable" && el.variableKey,
  );
  const variableKeys = [...new Set(variableElements.map((el) => el.variableKey!))];

  function handleAddVariable() {
    if (!newLabel.trim()) return;
    const key = normalizeVariableKey(newLabel);
    if (!key) return;

    pushHistory();
    const newEl: TemplateElement = {
      id: nanoid(10),
      type: "variable",
      content: `{{${key}}}`,
      variableKey: key,
      variableLabel: newLabel.trim(),
      variableRequired: getTemplateVariableDefaultRequired({ key, label: newLabel }),
      x: 200,
      y: 200,
      pageIndex: activePageIndex,
      width: 300,
      height: 48,
      fontSize: 28,
      fontFamily: "Arial",
      color: "#111827",
      align: "center",
      bold: false,
      italic: false,
      underline: false,
      lineHeight: 1.15,
    };
    addElement(newEl);
    setNewLabel("");
  }

  return (
    <div className="te-panel">
      <div className="te-panel-title">Variáveis</div>

      {/* Existing variables */}
      {variableKeys.length > 0 ? (
        <div className="te-placeholders" style={{ marginBottom: "0.75rem" }}>
          {variableKeys.map((key) => {
            const el = variableElements.find((e) => e.variableKey === key);
            return (
              <span key={key} className="te-placeholder-chip" title={el?.variableLabel || key}>
                {`{{${key}}}`}
              </span>
            );
          })}
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "0.75rem" }}>
          Nenhuma variável adicionada.
        </p>
      )}

      {/* Add new variable */}
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <input
          className="te-var-input"
          style={{ flex: 1 }}
          placeholder="Nome da variável…"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddVariable();
          }}
        />
        <button
          className="te-btn te-btn-primary"
          onClick={handleAddVariable}
          disabled={!newLabel.trim()}
          style={{ padding: "0 0.5rem" }}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}
