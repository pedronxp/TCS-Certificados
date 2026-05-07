/**
 * Editor Store — Zustand Central Store
 *
 * Single source of truth for the template editor.
 * Uses immer middleware for immutable updates on complex nested state.
 * Max 50 undo entries to keep memory bounded.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { nanoid } from "nanoid";
import type {
  EditorStore,
  HistoryEntry,
  SidebarTab,
} from "./editor-types";
import type { TemplateElement, TemplateLayout } from "@/lib/certificate-layout";

const MAX_HISTORY = 50;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;

/* ─── Helpers ─── */

function clampZoom(z: number) {
  return Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) * 100) / 100;
}

function snapshotString(state: Pick<EditorStore, "name" | "description" | "orientation" | "width" | "height" | "background" | "elements" | "baseAssets">) {
  return JSON.stringify({
    name: state.name,
    description: state.description,
    orientation: state.orientation,
    width: state.width,
    height: state.height,
    background: state.background,
    elements: state.elements,
    baseAssets: state.baseAssets,
  });
}

/* ─── Store ─── */

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    /* ═══ Document Slice ═══ */
    id: null,
    name: "Novo certificado",
    description: "",
    orientation: "landscape",
    width: 1123,
    height: 794,
    background: null,
    baseFileName: null,
    baseFileType: null,
    baseDocumentMode: null,
    basePages: [],
    baseFileDataUrl: null,
    basePreviewHtml: null,
    baseRenderDataUrl: null,
    baseRenderFileType: null,
    baseRenderEngine: null,
    baseImageDataUrl: null,
    baseImageEngine: null,
    baseAssets: [],

    setDocument: (patch) =>
      set((s) => {
        Object.assign(s, patch);
        s.isDirty = true;
      }),

    setOrientation: (orientation) =>
      set((s) => {
        s.orientation = orientation;
        if (orientation === "landscape") {
          s.width = 1123;
          s.height = 794;
        } else {
          s.width = 794;
          s.height = 1123;
        }
        s.isDirty = true;
      }),

    /* ═══ Elements Slice ═══ */
    elements: [],

    addElement: (element) =>
      set((s) => {
        s.elements.push(element);
        s.selectedId = element.id;
        s.isDirty = true;
      }),

    updateElement: (id, patch) =>
      set((s) => {
        const idx = s.elements.findIndex((el) => el.id === id);
        if (idx !== -1) {
          Object.assign(s.elements[idx], patch);
          s.isDirty = true;
        }
      }),

    removeElement: (id) =>
      set((s) => {
        const idx = s.elements.findIndex((el) => el.id === id);
        if (idx !== -1) {
          s.elements.splice(idx, 1);
          if (s.selectedId === id) s.selectedId = null;
          if (s.inlineEditId === id) s.inlineEditId = null;
          s.isDirty = true;
        }
      }),

    duplicateElement: (id) =>
      set((s) => {
        const source = s.elements.find((el) => el.id === id);
        if (!source) return;
        const copy: TemplateElement = {
          ...JSON.parse(JSON.stringify(source)),
          id: nanoid(10),
          x: source.x + 20,
          y: source.y + 20,
        };
        s.elements.push(copy);
        s.selectedId = copy.id;
        s.isDirty = true;
      }),

    reorderElement: (id, direction) =>
      set((s) => {
        const idx = s.elements.findIndex((el) => el.id === id);
        if (idx === -1) return;
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= s.elements.length) return;
        const temp = s.elements[idx];
        s.elements[idx] = s.elements[swapIdx];
        s.elements[swapIdx] = temp;
        s.isDirty = true;
      }),

    setElements: (elements) =>
      set((s) => {
        s.elements = elements;
        s.isDirty = true;
      }),

    /* ═══ Selection Slice ═══ */
    selectedId: null,
    activePageIndex: 0,
    inlineEditId: null,

    selectElement: (id) =>
      set((s) => {
        if (s.inlineEditId && s.inlineEditId !== id) s.inlineEditId = null;
        s.selectedId = id;
        if (id) {
          const el = s.elements.find((e) => e.id === id);
          if (el?.pageIndex !== undefined) s.activePageIndex = el.pageIndex;
          s.sidebarTab = "properties";
        }
      }),

    setActivePageIndex: (index) =>
      set((s) => {
        s.activePageIndex = index;
      }),

    startInlineEdit: (id) =>
      set((s) => {
        s.inlineEditId = id;
        s.selectedId = id;
      }),

    stopInlineEdit: () =>
      set((s) => {
        s.inlineEditId = null;
      }),

    clearSelection: () =>
      set((s) => {
        s.selectedId = null;
        s.inlineEditId = null;
      }),

    /* ═══ UI Slice ═══ */
    zoom: 1,
    isDirty: false,
    isSaving: false,
    sidebarTab: "properties" as SidebarTab,
    lastSavedAt: null,

    setZoom: (zoom) => set((s) => { s.zoom = clampZoom(zoom); }),
    zoomIn: () => set((s) => { s.zoom = clampZoom(s.zoom + ZOOM_STEP); }),
    zoomOut: () => set((s) => { s.zoom = clampZoom(s.zoom - ZOOM_STEP); }),
    resetZoom: () => set((s) => { s.zoom = 1; }),

    markDirty: () => set((s) => { s.isDirty = true; }),
    markClean: () => set((s) => { s.isDirty = false; s.lastSavedAt = Date.now(); }),
    setSaving: (saving) => set((s) => { s.isSaving = saving; }),
    setSidebarTab: (tab) => set((s) => { s.sidebarTab = tab; }),

    /* ═══ History (Undo/Redo) Slice ═══ */
    past: [],
    future: [],

    pushHistory: () =>
      set((s) => {
        const entry: HistoryEntry = {
          elements: JSON.parse(JSON.stringify(s.elements)),
          selectedId: s.selectedId,
        };
        s.past.push(entry);
        if (s.past.length > MAX_HISTORY) s.past.shift();
        s.future = [];
      }),

    undo: () =>
      set((s) => {
        const prev = s.past.pop();
        if (!prev) return;
        s.future.push({
          elements: JSON.parse(JSON.stringify(s.elements)),
          selectedId: s.selectedId,
        });
        s.elements = prev.elements;
        s.selectedId = prev.selectedId;
        s.inlineEditId = null;
        s.isDirty = true;
      }),

    redo: () =>
      set((s) => {
        const next = s.future.pop();
        if (!next) return;
        s.past.push({
          elements: JSON.parse(JSON.stringify(s.elements)),
          selectedId: s.selectedId,
        });
        s.elements = next.elements;
        s.selectedId = next.selectedId;
        s.inlineEditId = null;
        s.isDirty = true;
      }),

    clearHistory: () =>
      set((s) => {
        s.past = [];
        s.future = [];
      }),

    /* ═══ Serialization ═══ */

    toLayout: (): TemplateLayout => {
      const s = get();
      const layout: TemplateLayout = {
        elements: JSON.parse(JSON.stringify(s.elements)),
        basePages: s.basePages.length > 0 ? JSON.parse(JSON.stringify(s.basePages)) : undefined,
        baseDocumentMode: s.baseDocumentMode ?? undefined,
        baseFileName: s.baseFileName ?? undefined,
        baseFileType: s.baseFileType ?? undefined,
        baseFileDataUrl: s.baseFileDataUrl ?? undefined,
        basePreviewHtml: s.basePreviewHtml ?? undefined,
        baseRenderDataUrl: s.baseRenderDataUrl ?? undefined,
        baseRenderFileType: s.baseRenderFileType ?? undefined,
        baseRenderEngine: s.baseRenderEngine ?? undefined,
        baseImageDataUrl: s.baseImageDataUrl ?? undefined,
        baseImageEngine: s.baseImageEngine ?? undefined,
        baseAssets: s.baseAssets.length > 0 ? JSON.parse(JSON.stringify(s.baseAssets)) : undefined,
      };
      return layout;
    },

    fromTemplate: (template) =>
      set((s) => {
        s.id = template.id ?? null;
        s.name = template.name;
        s.description = template.description ?? "";
        s.orientation = template.orientation;
        s.width = template.width;
        s.height = template.height;
        s.background = template.background;

        const layout = template.layout;
        s.elements = layout.elements ?? [];
        s.basePages = layout.basePages ?? [];
        s.baseDocumentMode = layout.baseDocumentMode ?? null;
        s.baseFileName = layout.baseFileName ?? null;
        s.baseFileType = layout.baseFileType ?? null;
        s.baseFileDataUrl = layout.baseFileDataUrl ?? null;
        s.basePreviewHtml = layout.basePreviewHtml ?? null;
        s.baseRenderDataUrl = layout.baseRenderDataUrl ?? null;
        s.baseRenderFileType = layout.baseRenderFileType ?? null;
        s.baseRenderEngine = layout.baseRenderEngine ?? null;
        s.baseImageDataUrl = layout.baseImageDataUrl ?? null;
        s.baseImageEngine = layout.baseImageEngine ?? null;
        s.baseAssets = layout.baseAssets ?? [];

        // Reset transient state
        s.selectedId = s.elements[0]?.id ?? null;
        s.activePageIndex = s.elements[0]?.pageIndex ?? 0;
        s.inlineEditId = null;
        s.isDirty = false;
        s.isSaving = false;
        s.past = [];
        s.future = [];
        s.zoom = 1;
        s.sidebarTab = "properties";
        s.lastSavedAt = null;
      }),

    buildSnapshot: () => {
      const s = get();
      return snapshotString(s);
    },
  })),
);
