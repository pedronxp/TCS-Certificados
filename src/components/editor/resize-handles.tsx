/**
 * ResizeHandles — Corner handles for element resizing
 */

"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

type Handle = "nw" | "ne" | "sw" | "se";

const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];

interface ResizeHandlesProps {
  elementId: string;
  onStart: (e: ReactPointerEvent, id: string, handle: Handle) => void;
  onMove: (e: ReactPointerEvent) => void;
  onEnd: (e: ReactPointerEvent) => void;
}

export function ResizeHandles({ elementId, onStart, onMove, onEnd }: ResizeHandlesProps) {
  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle}
          className={`te-resize-handle te-resize-${handle}`}
          onPointerDown={(e) => onStart(e, elementId, handle)}
          onPointerMove={onMove}
          onPointerUp={onEnd}
        />
      ))}
    </>
  );
}
