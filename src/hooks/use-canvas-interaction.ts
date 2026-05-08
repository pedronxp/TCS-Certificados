/**
 * useCanvasInteraction — Drag, Resize & Inline Edit logic
 *
 * Encapsulates all pointer-based interactions on canvas elements:
 * - Drag to move
 * - Corner handles to resize
 * - Double-click to inline edit
 *
 * Works in canvas coordinate space (scaled by zoom).
 * Pushes undo history before any mutation.
 */

"use client";

import { useCallback, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  wasSelected: boolean;
  moved: boolean;
  historyPushed: boolean;
}

interface ResizeState {
  id: string;
  pointerId: number;
  handle: ResizeHandle;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
}

export function useCanvasInteraction() {
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  /* ─── Drag ─── */

  const startDrag = useCallback(
    (e: React.PointerEvent, elementId: string) => {
      const store = useEditorStore.getState();
      const el = store.elements.find((x) => x.id === elementId);
      if (!el || store.inlineEditId === elementId) return;
      if (e.button !== 0) return;

      if (e.detail === 2) {
        // Double click detected early, bypass drag
        if (el.type === "text" || el.type === "variable") {
          store.startInlineEdit(elementId);
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      const wasSelected = store.selectedId === elementId;
      store.selectElement(elementId);

      dragRef.current = {
        id: elementId,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: el.x,
        originY: el.y,
        wasSelected,
        moved: false,
        historyPushed: false,
      };
    },
    [],
  );

  const moveDrag = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;

      const zoom = useEditorStore.getState().zoom;
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      const movedEnough = Math.abs(e.clientX - drag.startX) > 2 || Math.abs(e.clientY - drag.startY) > 2;

      if (!movedEnough && !drag.moved) return;
      if (!drag.historyPushed) {
        useEditorStore.getState().pushHistory();
        drag.historyPushed = true;
      }
      drag.moved = true;

      useEditorStore.getState().updateElement(drag.id, {
        x: Math.round(drag.originX + dx),
        y: Math.round(drag.originY + dy),
      });
    },
    [],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.pointerId === e.pointerId) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        if (!drag.moved && drag.wasSelected) {
          const store = useEditorStore.getState();
          const el = store.elements.find((x) => x.id === drag.id);
          if (el?.type === "text" || el?.type === "variable") {
            store.startInlineEdit(drag.id);
          }
        }
        dragRef.current = null;
      }
    },
    [],
  );

  /* ─── Resize ─── */

  const startResize = useCallback(
    (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => {
      const store = useEditorStore.getState();
      const el = store.elements.find((x) => x.id === elementId);
      if (!el) return;

      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      store.pushHistory();

      resizeRef.current = {
        id: elementId,
        pointerId: e.pointerId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        originX: el.x,
        originY: el.y,
        originWidth: el.width,
        originHeight: el.height,
      };
    },
    [],
  );

  const moveResize = useCallback(
    (e: React.PointerEvent) => {
      const r = resizeRef.current;
      if (!r || r.pointerId !== e.pointerId) return;

      const zoom = useEditorStore.getState().zoom;
      const dx = (e.clientX - r.startX) / zoom;
      const dy = (e.clientY - r.startY) / zoom;

      let x = r.originX;
      let y = r.originY;
      let w = r.originWidth;
      let h = r.originHeight;

      if (r.handle.includes("w")) {
        x = r.originX + dx;
        w = r.originWidth - dx;
      }
      if (r.handle.includes("e")) {
        w = r.originWidth + dx;
      }
      if (r.handle.includes("n")) {
        y = r.originY + dy;
        h = r.originHeight - dy;
      }
      if (r.handle.includes("s")) {
        h = r.originHeight + dy;
      }

      const MIN = 24;
      useEditorStore.getState().updateElement(r.id, {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(MIN, Math.round(w)),
        height: Math.max(MIN, Math.round(h)),
      });
    },
    [],
  );

  const endResize = useCallback(
    (e: React.PointerEvent) => {
      if (resizeRef.current?.pointerId === e.pointerId) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        resizeRef.current = null;
      }
    },
    [],
  );

  /* ─── Inline Edit ─── */

  const handleDoubleClick = useCallback(
    (elementId: string) => {
      const store = useEditorStore.getState();
      const el = store.elements.find((x) => x.id === elementId);
      if (!el) return;
      if (el.type === "text" || el.type === "variable") {
        store.startInlineEdit(elementId);
      }
    },
    [],
  );

  return {
    // Drag
    startDrag,
    moveDrag,
    endDrag,
    // Resize
    startResize,
    moveResize,
    endResize,
    // Inline edit
    handleDoubleClick,
    // State refs for external checks
    isDragging: () => dragRef.current !== null,
    isResizing: () => resizeRef.current !== null,
  };
}
