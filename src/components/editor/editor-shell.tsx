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
import { isPdfDataUrl } from "@/lib/pdf-preview.client";
import type { TemplateLayout, TemplateLayoutPage } from "@/lib/certificate-layout";
import { EditorToolbar } from "./editor-toolbar";
import { EditorCanvas } from "./editor-canvas";
import { EditorSidebar } from "./editor-sidebar";
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

  useEffect(() => {
    const s = useEditorStore.getState();
    if (!isPdfDataUrl(s.baseRenderDataUrl)) return;
    if (s.baseDocumentMode === "editable" && s.elements.length > 0) return;
    if (s.baseImageEngine === "pdfjs-gotenberg" && s.basePages.some((p) => p.imageDataUrl)) return;

    let cancelled = false;

    (async () => {
      try {
        const { renderPdfPagesFromDataUrl } = await import("@/lib/pdf-preview.client");
        const renderedPages = await renderPdfPagesFromDataUrl(s.baseRenderDataUrl!);
        if (cancelled || renderedPages.length === 0) return;

        const pages = mergeRenderedPages(s.basePages, renderedPages);
        const firstPage = pages[0];

        useEditorStore.setState({
          basePages: pages,
          baseImageDataUrl: firstPage?.imageDataUrl ?? s.baseImageDataUrl,
          baseImageEngine: "pdfjs-gotenberg",
          width: firstPage?.width ?? s.width,
          height: firstPage?.height ?? s.height,
          orientation: firstPage?.orientation ?? s.orientation,
        });
      } catch (err) {
        console.error("Failed to render PDF preview pages:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Auto-generate DOCX preview if missing ─── */
  useEffect(() => {
    const s = useEditorStore.getState();
    const hasPreview =
      s.basePages.some((p) => p.imageDataUrl) ||
      s.baseRenderDataUrl ||
      s.baseImageDataUrl;
    const isDocx = isDocxSource(s.baseFileName, s.baseFileType, s.baseFileDataUrl);
    const needsEditableRefresh =
      isDocx && s.baseDocumentMode === "editable" && s.elements.length === 0;
    const needsPdfRefresh =
      isDocx &&
      s.baseImageEngine !== "pdfjs-gotenberg" &&
      !isPdfDataUrl(s.baseRenderDataUrl);

    if ((!needsEditableRefresh && hasPreview && !needsPdfRefresh) || !s.baseFileDataUrl) return;

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
          const firstPage = preview.pages[0] ?? preview.page;
          const isEditableDocx = s.baseDocumentMode === "editable" && preview.editable && preview.elements.length > 0;

          useEditorStore.setState({
            width: firstPage?.width ?? s.width,
            height: firstPage?.height ?? s.height,
            orientation: firstPage?.orientation ?? s.orientation,
            elements: isEditableDocx ? preview.elements : s.elements,
            basePages: preview.pages,
            baseDocumentMode: isEditableDocx ? "editable" : s.baseDocumentMode,
            baseRenderDataUrl: preview.renderDataUrl ?? null,
            baseRenderFileType: preview.renderFileType ?? null,
            baseRenderEngine: preview.renderEngine ?? null,
            baseImageDataUrl: preview.imageDataUrl ?? null,
            baseImageEngine: preview.imageEngine ?? null,
            baseAssets: preview.assets ?? s.baseAssets,
            isDirty: true,
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
      const isExistingTemplate = Boolean(store.id);
      const layout = store.toLayout({ compactBase: isExistingTemplate });
      const body = {
        name: store.name,
        description: store.description || null,
        width: store.width,
        height: store.height,
        orientation: store.orientation,
        background: isExistingTemplate && isDataUrl(store.background) ? undefined : store.background,
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

function isDataUrl(value: string | null) {
  return typeof value === "string" && value.startsWith("data:");
}

function mergeRenderedPages(
  currentPages: TemplateLayoutPage[],
  renderedPages: TemplateLayoutPage[],
) {
  return renderedPages.map((page, index) => {
    const current = currentPages[index];

    return {
      ...current,
      ...page,
      index: current?.index ?? page.index ?? index,
      border: current?.border ?? page.border,
    };
  });
}

function isDocxSource(
  fileName: string | null,
  fileType: string | null,
  dataUrl: string | null,
) {
  const lowerName = fileName?.toLowerCase() ?? "";
  const lowerType = fileType?.toLowerCase() ?? "";
  const lowerDataUrl = dataUrl?.toLowerCase() ?? "";

  return (
    lowerName.endsWith(".docx") ||
    lowerType.includes("wordprocessingml") ||
    lowerDataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml")
  );
}
