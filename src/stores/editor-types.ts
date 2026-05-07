/**
 * Editor Store — Type Definitions
 *
 * All interfaces that power the Zustand editor store.
 * Deliberately decoupled from React; these are pure data contracts.
 */

import type { TemplateBaseAsset, TemplateElement, TemplateLayout, TemplateLayoutPage } from "@/lib/certificate-layout";

/* ─── Document Slice ─── */
export interface DocumentState {
  id: string | null;
  name: string;
  description: string;
  orientation: string;
  width: number;
  height: number;
  background: string | null;
  /** Base-document metadata carried from the layout */
  baseFileName: string | null;
  baseFileType: string | null;
  baseDocumentMode: "native" | "editable" | null;
  basePages: TemplateLayoutPage[];
  /** Stored preview fields for DOCX rendering */
  baseFileDataUrl: string | null;
  basePreviewHtml: string | null;
  baseRenderDataUrl: string | null;
  baseRenderFileType: string | null;
  baseRenderEngine: string | null;
  baseImageDataUrl: string | null;
  baseImageEngine: string | null;
  baseAssets: TemplateBaseAsset[];
}

export interface DocumentActions {
  setDocument: (patch: Partial<DocumentState>) => void;
  setOrientation: (orientation: "landscape" | "portrait") => void;
}

/* ─── Elements Slice ─── */
export interface ElementsState {
  elements: TemplateElement[];
}

export interface ElementsActions {
  addElement: (element: TemplateElement) => void;
  updateElement: (id: string, patch: Partial<TemplateElement>) => void;
  removeElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  reorderElement: (id: string, direction: "up" | "down") => void;
  setElements: (elements: TemplateElement[]) => void;
}

/* ─── Selection Slice ─── */
export interface SelectionState {
  selectedId: string | null;
  activePageIndex: number;
  inlineEditId: string | null;
}

export interface SelectionActions {
  selectElement: (id: string | null) => void;
  setActivePageIndex: (index: number) => void;
  startInlineEdit: (id: string) => void;
  stopInlineEdit: () => void;
  clearSelection: () => void;
}

/* ─── UI Slice ─── */
export type SidebarTab = "properties" | "assets" | "variables" | "pages";

export interface UIState {
  zoom: number;
  isDirty: boolean;
  isSaving: boolean;
  sidebarTab: SidebarTab;
  lastSavedAt: number | null;
}

export interface UIActions {
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  markDirty: () => void;
  markClean: () => void;
  setSaving: (saving: boolean) => void;
  setSidebarTab: (tab: SidebarTab) => void;
}

/* ─── History (Undo/Redo) ─── */
export interface HistoryEntry {
  elements: TemplateElement[];
  selectedId: string | null;
}

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export interface HistoryActions {
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
}

/* ─── Serialization ─── */
export interface SerializationActions {
  /** Rebuild a TemplateLayout object from the current store state */
  toLayout: (options?: { compactBase?: boolean }) => TemplateLayout;
  /** Hydrate the store from a TemplateLayout + document metadata */
  fromTemplate: (template: {
    id?: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    orientation: string;
    background: string | null;
    layout: TemplateLayout;
  }) => void;
  /** Build a JSON snapshot string for dirty-checking */
  buildSnapshot: () => string;
}

/* ─── Composed Store ─── */
export type EditorStore = DocumentState &
  DocumentActions &
  ElementsState &
  ElementsActions &
  SelectionState &
  SelectionActions &
  UIState &
  UIActions &
  HistoryState &
  HistoryActions &
  SerializationActions;
