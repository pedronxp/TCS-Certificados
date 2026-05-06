/**
 * EditorShell — Root layout for the template editor
 *
 * Flexbox layout: Toolbar | Body (DocPanel? | Canvas | Sidebar)
 * Hydrates the Zustand store from the template prop on mount.
 * Hides the AppShell sidebar to maximize canvas space.
 */

"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "@/stores/editor-store";
import { useAutoSave } from "@/hooks/use-auto-save";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import type { TemplateLayout } from "@/lib/certificate-layout";
import { EditorToolbar } from "./editor-toolbar";
import { EditorCanvas } from "./editor-canvas";
import { EditorSidebar } from "./editor-sidebar";
import { EditorDocumentPanel } from "./editor-document-panel";
import "./editor.css";

interface EditorShellProps {
  initial: {
    id: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    orientation: string;
    background: string | null;
    layout: TemplateLayout;
  };
}

export function EditorShell({ initial }: EditorShellProps) {
  const router = useRouter();
  const fromTemplate = useEditorStore((s) => s.fromTemplate);
  const hydrated = useRef(false);

  /* ─── Hide AppShell sidebar on mount, restore on unmount ─── */
  useEffect(() => {
    document.body.classList.add("te-editor-active");
    return () => {
      document.body.classList.remove("te-editor-active");
      document.body.classList.remove("te-sidebar-visible");
    };
  }, []);

  /* ─── Hydrate store on mount ─── */
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    fromTemplate(initial);
  }, [initial, fromTemplate]);

  /* ─── Auto-generate DOCX preview if missing ─── */
  useEffect(() => {
    const s = useEditorStore.getState();
    const hasPreview =
      s.basePages.some((p) => p.imageDataUrl) ||
      s.baseRenderDataUrl ||
      s.baseImageDataUrl;

    if (hasPreview || !s.baseFileDataUrl) return;

    // Dynamically import the client-side extractor and generate preview
    (async () => {
      try {
        const { extractDocumentPreviewFromDataUrl } = await import(
          "@/lib/document-extract.client"
        );
        const preview = await extractDocumentPreviewFromDataUrl({
          dataUrl: s.baseFileDataUrl!,
          fileName: s.baseFileName ?? undefined,
          fileType: s.baseFileType ?? undefined,
        });
        if (preview?.pages && preview.pages.length > 0) {
          useEditorStore.getState().setDocument({
            basePages: preview.pages,
            baseRenderDataUrl: preview.renderDataUrl ?? null,
            baseRenderFileType: preview.renderFileType ?? null,
            baseRenderEngine: preview.renderEngine ?? null,
            baseImageDataUrl: preview.imageDataUrl ?? null,
            baseImageEngine: preview.imageEngine ?? null,
          });
        }
      } catch (err) {
        console.error("Failed to generate DOCX preview:", err);
      }
    })();
  }, []);

  /* ─── Save handler ─── */
  const handleSave = useCallback(async () => {
    const store = useEditorStore.getState();
    if (store.isSaving || !store.isDirty) return;

    store.setSaving(true);
    try {
      const layout = store.toLayout();
      const body = {
        name: store.name,
        description: store.description || null,
        width: store.width,
        height: store.height,
        orientation: store.orientation,
        background: store.background,
        layout,
      };

      const url = store.id ? `/api/templates/${store.id}` : "/api/templates";
      const method = store.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      const saved = await res.json();
      store.markClean();

      // If it was a new template, redirect to the edit page
      if (!store.id && saved.id) {
        store.setDocument({ id: saved.id });
        router.replace(`/modelos/${saved.id}/editar`);
      }
    } catch (err) {
      console.error("Save failed:", err);
      alert(err instanceof Error ? err.message : "Erro ao salvar o modelo.");
    } finally {
      store.setSaving(false);
    }
  }, [router]);

  /* ─── Auto-save & keyboard shortcuts ─── */
  useAutoSave({ onSave: handleSave });
  useKeyboardShortcuts({ onSave: handleSave });

  const hasBaseDocument = useEditorStore((s) => !!s.baseFileName);

  return (
    <div className="te-root">
      <EditorToolbar onSave={handleSave} />
      <div className="te-body">
        <EditorCanvas />
        <EditorSidebar />
      </div>
    </div>
  );
}
