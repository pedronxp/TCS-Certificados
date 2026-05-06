/**
 * useAutoSave — Debounced auto-save for the editor
 *
 * Watches the dirty flag and triggers a save callback after 2s of inactivity.
 * Provides manual save and beforeunload protection.
 */

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editor-store";

const AUTO_SAVE_DELAY = 2000;
const LEAVE_WARNING =
  "Você tem alterações não salvas. Se sair agora, vai perder o que foi mudado. Deseja sair mesmo?";

interface UseAutoSaveOptions {
  /** The function that performs the actual save (API call) */
  onSave: () => Promise<void>;
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean;
}

export function useAutoSave({ onSave, enabled = true }: UseAutoSaveOptions) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  /* ─── Debounced auto-save ─── */
  useEffect(() => {
    if (!enabled || !isDirty || isSaving) return;

    timerRef.current = setTimeout(() => {
      saveRef.current().catch(console.error);
    }, AUTO_SAVE_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDirty, isSaving, enabled]);

  /* ─── Before unload warning ─── */
  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = LEAVE_WARNING;
      return LEAVE_WARNING;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  /* ─── Manual save ─── */
  const save = useCallback(async () => {
    if (isSaving) return;
    await saveRef.current();
  }, [isSaving]);

  return { save, isDirty, isSaving };
}
