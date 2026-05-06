/**
 * CanvasElement — Single element rendered on the canvas
 *
 * Handles drag, resize, inline editing, and visual rendering.
 * Uses CSS classes from editor.css for selection/hover states.
 */

"use client";

import { useRef, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { useEditorStore } from "@/stores/editor-store";
import { ResizeHandles } from "./resize-handles";
import type { TemplateElement } from "@/lib/certificate-layout";

interface CanvasElementProps {
  element: TemplateElement;
  isSelected: boolean;
  isEditing: boolean;
  onDragStart: (e: ReactPointerEvent, id: string) => void;
  onDragMove: (e: ReactPointerEvent) => void;
  onDragEnd: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent, id: string, handle: "nw" | "ne" | "sw" | "se") => void;
  onResizeMove: (e: ReactPointerEvent) => void;
  onResizeEnd: (e: ReactPointerEvent) => void;
  onDoubleClick: (id: string) => void;
}

export function CanvasElement({
  element,
  isSelected,
  isEditing,
  onDragStart,
  onDragMove,
  onDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onDoubleClick,
}: CanvasElementProps) {
  const updateElement = useEditorStore((s) => s.updateElement);
  const stopInlineEdit = useEditorStore((s) => s.stopInlineEdit);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* Focus textarea when entering edit mode */
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const className = [
    "te-element",
    isSelected && "te-element-selected",
    isEditing && "te-element-editing",
  ]
    .filter(Boolean)
    .join(" ");

  const style: React.CSSProperties = {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    color: element.color,
    textAlign: element.align,
    fontWeight: element.bold ? "bold" : "normal",
    fontStyle: element.italic ? "italic" : "normal",
    textDecoration: element.underline ? "underline" : "none",
    lineHeight: element.lineHeight,
    alignItems: "flex-start",
    justifyContent:
      element.align === "center"
        ? "center"
        : element.align === "right"
          ? "flex-end"
          : "flex-start",
  };

  /* Render QR placeholder */
  if (element.type === "qr") {
    return (
      <div
        className={className}
        style={{
          ...style,
          display: "grid",
          placeItems: "center",
          background: "rgba(0,0,0,0.04)",
          border: isSelected ? undefined : "1px dashed var(--border-muted)",
        }}
        onPointerDown={(e) => onDragStart(e, element.id)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <svg viewBox="0 0 24 24" width="40%" height="40%" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="4" height="4" rx="0.5" />
          <line x1="21" y1="14" x2="21" y2="21" />
          <line x1="14" y1="21" x2="21" y2="21" />
        </svg>
        {isSelected && (
          <ResizeHandles
            elementId={element.id}
            onStart={onResizeStart}
            onMove={onResizeMove}
            onEnd={onResizeEnd}
          />
        )}
      </div>
    );
  }

  /* Render text / variable */
  return (
    <div
      className={className}
      style={style}
      onPointerDown={(e) => {
        if (!isEditing) onDragStart(e, element.id);
      }}
      onPointerMove={(e) => {
        if (!isEditing) onDragMove(e);
      }}
      onPointerUp={(e) => {
        if (!isEditing) onDragEnd(e);
      }}
      onDoubleClick={() => onDoubleClick(element.id)}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="te-inline-textarea"
          defaultValue={element.content}
          style={{
            fontSize: element.fontSize,
            fontFamily: element.fontFamily,
            color: element.color,
            textAlign: element.align,
            fontWeight: element.bold ? "bold" : "normal",
            fontStyle: element.italic ? "italic" : "normal",
            lineHeight: element.lineHeight,
          }}
          onBlur={(e) => {
            pushHistory();
            updateElement(element.id, { content: e.target.value });
            stopInlineEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              stopInlineEdit();
            }
          }}
        />
      ) : (
        <span style={{ pointerEvents: "none", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {element.content || (element.type === "variable" ? `{{${element.variableKey}}}` : "Texto")}
        </span>
      )}

      {isSelected && !isEditing && (
        <ResizeHandles
          elementId={element.id}
          onStart={onResizeStart}
          onMove={onResizeMove}
          onEnd={onResizeEnd}
        />
      )}
    </div>
  );
}
