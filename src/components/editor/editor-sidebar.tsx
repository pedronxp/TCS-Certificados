/**
 * EditorSidebar — Right panel with tabbed sections
 *
 * Tabs: Properties | Variables | Pages
 * Also includes document settings and the import zone.
 */

"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { Plus, QrCode, Type } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";
import { PropertyPanel } from "./property-panel";
import { VariablePanel } from "./variable-panel";
import { PageNavigator } from "./page-navigator";
import { ImportZone } from "./import-zone";
import type { SidebarTab } from "@/stores/editor-types";
import type { TemplateElement } from "@/lib/certificate-layout";

const TABS: { key: SidebarTab; label: string }[] = [
  { key: "properties", label: "Propriedades" },
  { key: "variables", label: "Variáveis" },
  { key: "pages", label: "Páginas" },
];

export function EditorSidebar() {
  const sidebarTab = useEditorStore((s) => s.sidebarTab);
  const setSidebarTab = useEditorStore((s) => s.setSidebarTab);
  const name = useEditorStore((s) => s.name);
  const description = useEditorStore((s) => s.description);
  const orientation = useEditorStore((s) => s.orientation);
  const setDocument = useEditorStore((s) => s.setDocument);
  const setOrientation = useEditorStore((s) => s.setOrientation);
  const addElement = useEditorStore((s) => s.addElement);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const activePageIndex = useEditorStore((s) => s.activePageIndex);

  function handleAddText() {
    pushHistory();
    const el: TemplateElement = {
      id: nanoid(10),
      type: "text",
      content: "Novo texto",
      variableRequired: true,
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
    addElement(el);
  }

  function handleAddQR() {
    pushHistory();
    const el: TemplateElement = {
      id: nanoid(10),
      type: "qr",
      content: "",
      variableRequired: true,
      x: 60,
      y: 60,
      pageIndex: activePageIndex,
      width: 120,
      height: 120,
      fontSize: 12,
      fontFamily: "Arial",
      color: "#000000",
      align: "center",
      bold: false,
      italic: false,
      underline: false,
      lineHeight: 1,
    };
    addElement(el);
  }

  return (
    <div className="te-sidebar">
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className="te-btn"
            style={{
              flex: 1,
              border: "none",
              borderRadius: 0,
              borderBottom: sidebarTab === tab.key ? "2px solid var(--brand-600)" : "2px solid transparent",
              color: sidebarTab === tab.key ? "var(--brand-600)" : "var(--text-muted)",
              background: "transparent",
              fontSize: "0.78rem",
            }}
            onClick={() => setSidebarTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {sidebarTab === "properties" && <PropertyPanel />}
      {sidebarTab === "variables" && <VariablePanel />}
      {sidebarTab === "pages" && <PageNavigator />}

      {/* ─── Quick add buttons ─── */}
      <div className="te-panel" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="te-panel-title">Adicionar</div>
        <div style={{ display: "grid", gap: "0.375rem" }}>
          <button className="te-btn" onClick={handleAddText} style={{ justifyContent: "flex-start" }}>
            <Type /> Texto
          </button>
          <button className="te-btn" onClick={handleAddQR} style={{ justifyContent: "flex-start" }}>
            <QrCode /> QR Code
          </button>
        </div>
      </div>

      {/* ─── Document settings ─── */}
      <div className="te-panel" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="te-panel-title">Configurações</div>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div className="field">
            <span className="field-label">Nome do modelo</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setDocument({ name: e.target.value })}
            />
          </div>
          <div className="field">
            <span className="field-label">Descrição</span>
            <textarea
              value={description}
              onChange={(e) => setDocument({ description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="field">
            <span className="field-label">Orientação</span>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as "landscape" | "portrait")}
            >
              <option value="landscape">A4 Paisagem</option>
              <option value="portrait">A4 Retrato</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Import zone ─── */}
      <ImportZone />
    </div>
  );
}
