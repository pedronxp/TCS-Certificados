/**
 * useKeyboardShortcuts — Global keyboard shortcuts for the editor
 *
 * Ctrl+Z → Undo
 * Ctrl+Shift+Z / Ctrl+Y → Redo
 * Ctrl+S → Save
 * Delete / Backspace → Remove selected element (when not inline editing)
 * Ctrl+D → Duplicate selected element
 * Escape → Clear selection / stop inline edit
 */

"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";

interface UseKeyboardShortcutsOptions {
  /** Called when Ctrl+S is pressed */
  onSave?: () => void;
}

export function useKeyboardShortcuts({ onSave }: UseKeyboardShortcutsOptions = {}) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const store = useEditorStore.getState();
      const isInputFocused =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement;

      const mod = e.ctrlKey || e.metaKey;

      /* ─── Ctrl+Z → Undo ─── */
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        return;
      }

      /* ─── Ctrl+Shift+Z / Ctrl+Y → Redo ─── */
      if ((mod && e.key === "z" && e.shiftKey) || (mod && e.key === "y")) {
        e.preventDefault();
        store.redo();
        return;
      }

      /* ─── Ctrl+S → Save ─── */
      if (mod && e.key === "s") {
        e.preventDefault();
        onSaveRef.current?.();
        return;
      }

      /* ─── Ctrl+D → Duplicate ─── */
      if (mod && e.key === "d" && store.selectedId && !store.inlineEditId) {
        e.preventDefault();
        store.pushHistory();
        store.duplicateElement(store.selectedId);
        return;
      }

      /* ─── Escape → Clear selection or stop inline edit ─── */
      if (e.key === "Escape") {
        if (store.inlineEditId) {
          store.stopInlineEdit();
        } else {
          store.clearSelection();
        }
        return;
      }

      /* ─── Delete / Backspace → Remove element ─── */
      if ((e.key === "Delete" || e.key === "Backspace") && store.selectedId && !store.inlineEditId && !isInputFocused) {
        e.preventDefault();
        store.pushHistory();
        store.removeElement(store.selectedId);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
