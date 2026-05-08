"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignLeft, AlignRight, Copy, FileText, FileUp, Italic, Layers, Plus, QrCode, RefreshCcw, Save, Trash2, Type, Underline, X } from "lucide-react";
import {
  defaultLayout,
  extractVariableKeys,
  hasVisualBasePreview,
  isDefaultStarterLayout,
  labelFromKey,
  normalizeVisualDocxLayout,
  normalizeVariableKey,
  templateLayoutSchema,
  uploadedBaseLayout,
  type TemplateElement,
  type TemplateLayout,
  type TemplateLayoutPage,
  type TemplateVariableDefinition,
} from "@/lib/certificate-layout";
import { useConfirmDialog } from "@/components/confirmation-dialog";
import { dataUrlToHtmlDocument, extractDocumentPreview, extractDocumentPreviewFromDataUrl, extractEditableDocxElementsFromDataUrl } from "@/lib/document-extract.client";
import { templateImportDraftStorageKey, type TemplateImportDraft } from "@/lib/template-import-draft";

type TemplateEditorProps = {
  initial?: {
    id: string;
    name: string;
    description: string | null;
    width: number;
    height: number;
    orientation: string;
    background: string | null;
    layout: TemplateLayout;
  };
};

type TextSelection = {
  start: number;
  end: number;
};

type ResizeHandle = "nw" | "ne" | "sw" | "se";

const PAGE_PRESETS = {
  landscape: { label: "A4 paisagem", width: 1123, height: 794 },
  portrait: { label: "A4 retrato", width: 794, height: 1123 },
} as const;

const FONT_OPTIONS = ["Arial", "Georgia", "Times New Roman", "Verdana", "Tahoma", "Courier New"] as const;
const LINE_HEIGHT_OPTIONS = [1, 1.15, 1.3, 1.5, 1.8, 2] as const;
const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

const LEAVE_WARNING =
  "Voce tem alteracoes nao salvas. Se sair agora, vai perder o que foi mudado. Deseja sair mesmo?";

export function TemplateEditor({ initial }: TemplateEditorProps) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const initialLayout = useMemo(
    () => normalizeVisualDocxLayout(initial?.layout ?? defaultLayout()),
    [initial?.layout],
  );
  const [name, setName] = useState(initial?.name ?? "Novo certificado");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [orientation, setOrientation] = useState(initial?.orientation ?? "landscape");
  const [width, setWidth] = useState(initial?.width ?? 1123);
  const [height, setHeight] = useState(initial?.height ?? 794);
  const [background, setBackground] = useState<string | null>(initial?.background ?? null);
  const [layout, setLayout] = useState<TemplateLayout>(() => initialLayout);
  const [selectedId, setSelectedId] = useState(initialLayout.elements[0]?.id ?? "");
  const [activePageIndex, setActivePageIndex] = useState(initialLayout.elements[0]?.pageIndex ?? 0);
  const [saving, setSaving] = useState(false);
  const [previewBounds, setPreviewBounds] = useState({ width: 0, height: 0 });
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    buildSnapshot({
      name: initial?.name ?? "Novo certificado",
      description: initial?.description ?? "",
      orientation: initial?.orientation ?? "landscape",
      width: initial?.width ?? 1123,
      height: initial?.height ?? 794,
      background: initial?.background ?? null,
      layout: initialLayout,
    }),
  );
  const skipLeaveWarningRef = useRef(false);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const [inlineEditId, setInlineEditId] = useState("");
  const [newVariableLabel, setNewVariableLabel] = useState("");
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    id: string;
    pointerId: number;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  const selected = layout.elements.find((element) => element.id === selectedId) ?? layout.elements[0];
  const currentSnapshot = useMemo(
    () => buildSnapshot({ name, description, orientation, width, height, background, layout }),
    [background, description, height, layout, name, orientation, width],
  );
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot;
  const isDocxTemplate = isDocxLayout(layout);
  const isPptxTemplate = isPptxLayout(layout);
  const editorModeLabel = isDocxTemplate ? "Editor DOCX" : isPptxTemplate ? "Editor PPTX" : "Editor de documento";
  const baseFileLabel = layout.baseFileName ?? name;
  const hasImportedBase = Boolean(background || layout.baseRenderDataUrl || layout.baseImageDataUrl || layout.baseFileDataUrl || layout.basePreviewHtml);
  const hasVisualBase = hasVisualBasePreview(layout);
  const isEditableDocxBase = layout.baseDocumentMode === "editable" && isDocxTemplate && !hasVisualBase;
  const editorPages = useMemo(
    () => buildEditorPages({ layout, width, height, orientation, background }),
    [background, height, layout, orientation, width],
  );
  const hasMultipleEditorPages = editorPages.length > 1;
  const pageStackWidth = useMemo(
    () => Math.max(1, ...editorPages.map((page) => page.width)),
    [editorPages],
  );
  const pageStackHeight = useMemo(
    () => editorPages.reduce((total, page) => Math.max(total, page.offsetTop + page.height), 0),
    [editorPages],
  );
  const scale = useMemo(() => {
    const availableWidth = Math.max(280, (previewBounds.width || 900) - 16);
    const availableHeight = Math.max(320, (previewBounds.height || 680) - 16);
    const heightRatio = hasMultipleEditorPages ? 1 : availableHeight / pageStackHeight;
    return Math.max(0.28, Math.min(1, availableWidth / pageStackWidth, heightRatio));
  }, [hasMultipleEditorPages, pageStackHeight, pageStackWidth, previewBounds.height, previewBounds.width]);
  const previewSize = useMemo(
    () => ({ width: Math.ceil(pageStackWidth * scale), height: Math.ceil(pageStackHeight * scale) }),
    [pageStackHeight, pageStackWidth, scale],
  );
  const selectedContentRange = getSelectedContentRange(selected?.content ?? "", contentSelection);
  const selectedContentText = selected?.content.slice(selectedContentRange.start, selectedContentRange.end).trim() ?? "";
  const canTransformContent = Boolean(
    selected &&
      (selected.type === "text" || selected.type === "variable") &&
      (selectedContentText || selected.content.trim()),
  );
  const allVariables = useMemo(() => {
    const map = new Map<string, { label: string; required: boolean }>();
    if (layout.baseDocumentMode !== "editable") {
      for (const key of extractVariableKeys(layout.basePreviewHtml ?? "")) {
        map.set(key, { label: labelFromKey(key), required: true });
      }
    }
    for (const el of layout.elements) {
      for (const key of extractVariableKeys(el.content ?? "")) {
        if (!map.has(key)) map.set(key, { label: labelFromKey(key), required: true });
      }
      if (el.type === "variable" && el.variableKey && !map.has(el.variableKey)) {
        map.set(el.variableKey, { label: el.variableLabel ?? labelFromKey(el.variableKey), required: el.variableRequired });
      }
    }
    for (const def of layout.variableDefinitions ?? []) {
      if (def.key) map.set(def.key, { label: def.label || labelFromKey(def.key), required: def.required });
    }
    return [...map.entries()].map(([key, v]) => ({ key, label: v.label, required: v.required }));
  }, [layout.baseDocumentMode, layout.basePreviewHtml, layout.elements, layout.variableDefinitions]);
  const selectedVariableIssues = useMemo(
    () => findVariableIssues(selected?.content ?? ""),
    [selected?.content],
  );
  const selectedContentVariables = useMemo(
    () => extractVariableKeys(selected?.content ?? ""),
    [selected?.content],
  );

  useEffect(() => {
    let frameId = 0;

    function scheduleMeasure() {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const element = previewViewportRef.current;
        if (!element) return;

        const rect = element.getBoundingClientRect();
        setPreviewBounds({
          width: Math.floor(rect.width),
          height: Math.max(360, Math.floor(window.innerHeight - rect.top - 24)),
        });
      });
    }

    const observer = new ResizeObserver(scheduleMeasure);
    if (previewViewportRef.current) observer.observe(previewViewportRef.current);
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  useEffect(() => {
    if (initial) return;

    const rawDraft = window.sessionStorage.getItem(templateImportDraftStorageKey);
    if (!rawDraft) return;

    try {
      const draft = parseImportDraft(rawDraft);

      window.setTimeout(() => {
        setName(draft.name);
        setDescription(draft.description);
        setOrientation(draft.orientation);
        setWidth(draft.width);
        setHeight(draft.height);
        setBackground(draft.background);
        const normalizedLayout = normalizeVisualDocxLayout(draft.layout);
        setLayout(normalizedLayout);
        setSelectedId(normalizedLayout.elements[0]?.id ?? "");
        setActivePageIndex(normalizedLayout.elements[0]?.pageIndex ?? 0);
        skipLeaveWarningRef.current = false;
      }, 0);
    } catch {
      alert("Nao foi possivel carregar o rascunho importado.");
    } finally {
      window.sessionStorage.removeItem(templateImportDraftStorageKey);
    }
  }, [initial]);

  useEffect(() => {
    if (!layout.baseFileDataUrl || !isOfficeSource(layout.baseFileName, layout.baseFileType, layout.baseFileDataUrl)) return;
    const hasAnyBasePageMetadata = (layout.basePages?.length ?? 0) > 0;
    if (
      hasUsableBasePages(layout.basePages) ||
      (hasAnyBasePageMetadata && Boolean(layout.baseRenderDataUrl || layout.baseImageDataUrl || layout.basePreviewHtml))
    ) {
      return;
    }

    let cancelled = false;

    void extractDocumentPreviewFromDataUrl({
      dataUrl: layout.baseFileDataUrl,
      fileName: layout.baseFileName,
      fileType: layout.baseFileType,
    }).then((preview) => {
      if (cancelled) return;

      if (preview.converterOffline && !window.sessionStorage.getItem("tcs-gotenberg-alerted")) {
        alert("Aviso: O servico de conversao de documentos (Gotenberg/LibreOffice) parece estar indisponivel. Um preview de fallback local sera utilizado, mas pode apresentar diferencas visuais. Configure GOTENBERG_URL no servidor.");
        window.sessionStorage.setItem("tcs-gotenberg-alerted", "true");
      }

      setLayout((current) => {
        if (current.baseFileDataUrl !== layout.baseFileDataUrl || hasUsableBasePages(current.basePages)) {
          return current;
        }

        return {
          ...current,
          basePages: preview.pages?.length ? preview.pages : current.basePages,
          basePreviewHtml: current.basePreviewHtml ?? preview.previewHtml,
          baseRenderDataUrl: current.baseRenderDataUrl ?? preview.renderDataUrl,
          baseRenderFileType: current.baseRenderFileType ?? preview.renderFileType,
          baseRenderEngine: current.baseRenderEngine ?? preview.renderEngine,
          baseImageDataUrl: current.baseImageDataUrl ?? preview.imageDataUrl,
          baseImageEngine: current.baseImageEngine ?? preview.imageEngine,
          basePageBorder: current.basePageBorder ?? preview.page?.border,
        };
      });
    }).catch((error) => {
      console.warn("Nao foi possivel atualizar o preview multipagina do documento.", error);
    });

    return () => {
      cancelled = true;
    };
  }, [layout.baseFileDataUrl, layout.baseFileName, layout.baseFileType, layout.baseImageDataUrl, layout.basePages, layout.basePreviewHtml, layout.baseRenderDataUrl]);

  useEffect(() => {
    if (!layout.baseFileDataUrl || !layout.baseFileType?.includes("wordprocessingml")) return;
    if (layout.baseDocumentMode === "native" || layout.baseDocumentMode === "editable" || hasVisualBase || layout.elements.length > 0) return;

    let cancelled = false;

    void extractEditableDocxElementsFromDataUrl(layout.baseFileDataUrl, {
      width,
      height,
      orientation: orientation === "portrait" ? "portrait" : "landscape",
      border: layout.basePageBorder,
    }).then((elements) => {
      if (cancelled || elements.length === 0) return;

      setLayout((current) => {
        if (
          current.baseDocumentMode === "editable" ||
          current.elements.length > 0 ||
          current.baseFileDataUrl !== layout.baseFileDataUrl
        ) {
          return current;
        }

        return {
          ...current,
          baseDocumentMode: "editable",
          baseRenderDataUrl: undefined,
          baseRenderFileType: undefined,
          baseRenderEngine: undefined,
          baseImageDataUrl: undefined,
          baseImageEngine: undefined,
          elements,
        };
      });
      setSelectedId(elements[0]?.id ?? "");
      setActivePageIndex(elements[0]?.pageIndex ?? 0);

      const maxBottom = Math.max(0, ...elements.map((element) => element.y + element.height));
      if (maxBottom > height) setHeight(Math.ceil(maxBottom + 24));
    });

    return () => {
      cancelled = true;
    };
  }, [
    height,
    layout.baseDocumentMode,
    layout.baseFileDataUrl,
    layout.baseFileType,
    layout.basePageBorder,
    layout.elements.length,
    hasVisualBase,
    layout.basePages,
    layout.baseRenderDataUrl,
    layout.baseImageDataUrl,
    orientation,
    width,
  ]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (skipLeaveWarningRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!hasUnsavedChanges || skipLeaveWarningRef.current) return;
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const nextUrl = new URL(anchor.href);
      if (nextUrl.origin !== window.location.origin || nextUrl.href === window.location.href) return;

      event.preventDefault();
      event.stopPropagation();

      void confirm({
        title: "Sair sem salvar",
        message: LEAVE_WARNING,
        confirmLabel: "Sair",
        tone: "danger",
      }).then((confirmed) => {
        if (!confirmed) return;
        skipLeaveWarningRef.current = true;
        router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      });
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [confirm, hasUnsavedChanges, router]);

  useEffect(() => {
    if (!inlineEditId) return;

    window.setTimeout(() => {
      inlineTextareaRef.current?.focus();
      inlineTextareaRef.current?.select();
    }, 0);
  }, [inlineEditId]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (!selected || isTypingTarget(event.target)) return;

      const key = event.key;
      if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        const deletedId = selected.id;
        setLayout((current) => ({ ...current, elements: current.elements.filter((item) => item.id !== deletedId) }));
        setSelectedId("");
        setInlineEditId("");
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "d") {
        event.preventDefault();
        const page = findEditorPage(editorPages, selected.pageIndex);
        const copy = duplicateElement(selected, page.width, page.height);
        setLayout((current) => ({ ...current, elements: [...current.elements, copy] }));
        setSelectedId(copy.id);
        setActivePageIndex(copy.pageIndex ?? 0);
        return;
      }

      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;

      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const deltaX = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
      const deltaY = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
      const selectedId = selected.id;

      setLayout((current) => ({
        ...current,
        elements: current.elements.map((element) => {
          if (element.id !== selectedId) return element;

          const page = findEditorPage(editorPages, element.pageIndex);
          return {
            ...element,
            x: clamp(element.x + deltaX, 0, Math.max(0, page.width - element.width)),
            y: clamp(element.y + deltaY, 0, Math.max(0, page.height - element.height)),
          };
        }),
      }));
    }

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [editorPages, selected]);

  function updateElement(patch: Partial<TemplateElement>) {
    if (!selected) return;
    updateElementById(selected.id, patch);
  }

  function updateElementById(id: string, patch: Partial<TemplateElement>) {
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === id ? { ...element, ...patch } : element,
      ),
    }));
  }

  function deleteSelectedElement() {
    if (!selected) return;
    const id = selected.id;
    setLayout((current) => ({ ...current, elements: current.elements.filter((item) => item.id !== id) }));
    setSelectedId("");
    setInlineEditId("");
  }

  function duplicateSelectedElement() {
    if (!selected) return;
    const page = findEditorPage(editorPages, selected.pageIndex);
    const copy = duplicateElement(selected, page.width, page.height);
    setLayout((current) => ({ ...current, elements: [...current.elements, copy] }));
    setSelectedId(copy.id);
    setActivePageIndex(copy.pageIndex ?? 0);
    setInlineEditId("");
  }

  function syncContentSelection() {
    const textarea = contentTextareaRef.current;
    if (!textarea) return;
    setContentSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  }

  function transformContentSelectionToVariable() {
    if (!selected || (selected.type !== "text" && selected.type !== "variable")) return;

    const content = selected.content;
    const range = getSelectedContentRange(content, contentSelection);
    const selectedText = content.slice(range.start, range.end).trim();
    const fallbackText = selectedText || content.trim();
    if (!fallbackText) return;

    const label = suggestVariableLabel(fallbackText);

    const key = uniqueVariableKey(normalizeVariableKey(label) || normalizeVariableKey(fallbackText) || "campo", layout);
    const token = `{{${key}}}`;
    const hasSelection = range.start !== range.end;
    const nextContent = hasSelection ? `${content.slice(0, range.start)}${token}${content.slice(range.end)}` : token;
    const definition: TemplateVariableDefinition = { key, label, required: true };

    setLayout((current) => ({
      ...upsertVariableDefinition(current, definition),
      elements: current.elements.map((element) => {
        if (element.id !== selected.id) return element;

        return {
          ...element,
          type: hasSelection ? element.type : "variable",
          content: nextContent,
          variableKey: hasSelection ? element.variableKey : key,
          variableLabel: hasSelection ? element.variableLabel : label,
          variableRequired: hasSelection ? element.variableRequired : true,
        };
      }),
    }));

    window.setTimeout(() => {
      const textarea = contentTextareaRef.current;
      if (!textarea) return;
      const cursor = range.start + token.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
      setContentSelection({ start: cursor, end: cursor });
    }, 0);
  }

  function insertVariableAtCursor(key: string, label?: string) {
    if (!selected || (selected.type !== "text" && selected.type !== "variable")) return;

    const normalizedKey = normalizeVariableKey(key);
    if (!normalizedKey) return;

    const definition: TemplateVariableDefinition = {
      key: normalizedKey,
      label: label?.trim() || labelFromKey(normalizedKey),
      required: true,
    };
    const range = getSelectedContentRange(selected.content, contentSelection);
    const token = `{{${normalizedKey}}}`;
    const nextContent = `${selected.content.slice(0, range.start)}${token}${selected.content.slice(range.end)}`;
    const cursor = range.start + token.length;

    setLayout((current) => ({
      ...upsertVariableDefinition(current, definition),
      elements: current.elements.map((element) => {
        if (element.id !== selected.id) return element;

        return {
          ...element,
          content: nextContent,
          type: element.type === "variable" && !element.variableKey ? "variable" : element.type,
          variableKey: element.type === "variable" && !element.variableKey ? normalizedKey : element.variableKey,
          variableLabel: element.type === "variable" && !element.variableLabel ? definition.label : element.variableLabel,
        };
      }),
    }));

    window.setTimeout(() => {
      const textarea = contentTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
      setContentSelection({ start: cursor, end: cursor });
    }, 0);
  }

  function addElement(type: TemplateElement["type"]) {
    addField(type);
  }

  function addField(type: TemplateElement["type"], preset?: { key: string; label: string }) {
    const id = `${type}-${crypto.randomUUID()}`;
    const variableKey = preset?.key ?? "nova_variavel";
    const variableLabel = preset?.label ?? "Nova variavel";
    const page = findEditorPage(editorPages, activePageIndex);
    const element: TemplateElement = {
      id,
      type,
      content: type === "variable" ? `{{${variableKey}}}` : type === "text" ? "Novo texto" : "",
      variableKey: type === "variable" ? variableKey : undefined,
      variableLabel: type === "variable" ? variableLabel : undefined,
      variableRequired: true,
      pageIndex: page.index,
      x: Math.min(120, Math.max(0, page.width - (type === "qr" ? 110 : 280))),
      y: Math.min(120, Math.max(0, page.height - (type === "qr" ? 110 : 60))),
      width: type === "qr" ? 110 : 280,
      height: type === "qr" ? 110 : 60,
      fontSize: 28,
      fontFamily: "Arial",
      color: "#111827",
      align: "center",
      bold: false,
      italic: false,
      underline: false,
      lineHeight: 1.15,
    };
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(id);
    setActivePageIndex(page.index);
  }

  function addPlaceholderPreset(key: string, label: string) {
    addField("variable", { key, label });
  }

  function updateVariableDefinition(key: string, patch: Partial<Omit<TemplateVariableDefinition, "key">>) {
    setLayout((current) => {
      const existing = (current.variableDefinitions ?? []).find((d) => d.key === key);
      const updated: TemplateVariableDefinition = {
        key,
        label: existing?.label ?? labelFromKey(key),
        required: existing?.required ?? true,
        ...patch,
      };
      return upsertVariableDefinition(current, updated);
    });
  }

  function addNewVariableDefinition() {
    const label = newVariableLabel.trim();
    if (!label) return;
    const key = uniqueVariableKey(normalizeVariableKey(label) || "campo", layout);
    setLayout((current) => upsertVariableDefinition(current, { key, label, required: true }));
    setNewVariableLabel("");
  }

  function applyPagePreset(nextOrientation: string) {
    const preset = PAGE_PRESETS[nextOrientation as keyof typeof PAGE_PRESETS];
    setOrientation(nextOrientation);
    if (preset) {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, element: TemplateElement) {
    if (event.button !== 0) return;
    if (inlineEditId === element.id || isTypingTarget(event.target) || isResizeHandleTarget(event.target)) return;
    setSelectedId(element.id);
    setActivePageIndex(element.pageIndex ?? 0);
    dragRef.current = {
      id: element.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaX = (event.clientX - drag.startX) / scale;
    const deltaY = (event.clientY - drag.startY) / scale;

    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== drag.id) return element;
        const page = findEditorPage(editorPages, element.pageIndex);
        return {
          ...element,
          x: clamp(Math.round(drag.originX + deltaX), 0, Math.max(0, page.width - element.width)),
          y: clamp(Math.round(drag.originY + deltaY), 0, Math.max(0, page.height - element.height)),
        };
      }),
    }));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = null;
  }

  function beginResize(event: ReactPointerEvent<HTMLSpanElement>, element: TemplateElement, handle: ResizeHandle) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(element.id);
    setActivePageIndex(element.pageIndex ?? 0);
    resizeRef.current = {
      id: element.id,
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      originX: element.x,
      originY: element.y,
      originWidth: element.width,
      originHeight: element.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: ReactPointerEvent<HTMLSpanElement>) {
    const resize = resizeRef.current;
    if (!resize) return;

    const deltaX = (event.clientX - resize.startX) / scale;
    const deltaY = (event.clientY - resize.startY) / scale;

    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== resize.id) return element;

        const page = findEditorPage(editorPages, element.pageIndex);
        const minSize = element.type === "qr" ? 48 : 20;
        let nextX = resize.originX;
        let nextY = resize.originY;
        let nextWidth = resize.originWidth;
        let nextHeight = resize.originHeight;

        if (resize.handle.includes("e")) nextWidth = resize.originWidth + deltaX;
        if (resize.handle.includes("s")) nextHeight = resize.originHeight + deltaY;
        if (resize.handle.includes("w")) {
          nextX = resize.originX + deltaX;
          nextWidth = resize.originWidth - deltaX;
        }
        if (resize.handle.includes("n")) {
          nextY = resize.originY + deltaY;
          nextHeight = resize.originHeight - deltaY;
        }

        nextWidth = Math.max(minSize, Math.round(nextWidth));
        nextHeight = Math.max(minSize, Math.round(nextHeight));
        nextX = clamp(Math.round(nextX), 0, Math.max(0, page.width - nextWidth));
        nextY = clamp(Math.round(nextY), 0, Math.max(0, page.height - nextHeight));

        if (nextX + nextWidth > page.width) nextWidth = page.width - nextX;
        if (nextY + nextHeight > page.height) nextHeight = page.height - nextY;

        return {
          ...element,
          x: nextX,
          y: nextY,
          width: Math.max(minSize, nextWidth),
          height: Math.max(minSize, nextHeight),
        };
      }),
    }));
  }

  function endResize(event: ReactPointerEvent<HTMLSpanElement>) {
    const resize = resizeRef.current;
    if (!resize) return;
    if (event.currentTarget.hasPointerCapture(resize.pointerId)) {
      event.currentTarget.releasePointerCapture(resize.pointerId);
    }
    resizeRef.current = null;
  }

  async function readFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function applyBaseFile(file: File, mode: "merge" | "replace" = "replace") {
    const dataUrl = await readFile(file);
    const fileType = file.type || guessFileType(file.name);
    const extracted = await extractDocumentPreview(file);
    const isDocxFile = fileType.includes("wordprocessingml");
    const isPptxFile = fileType.includes("presentationml");
    const nextBase = uploadedBaseLayout({
      fileName: file.name,
      fileType,
      dataUrl,
      previewHtml: extracted.previewHtml,
      renderDataUrl: extracted.renderDataUrl,
      renderFileType: extracted.renderFileType,
      renderEngine: extracted.renderEngine,
      imageDataUrl: extracted.imageDataUrl,
      imageEngine: extracted.imageEngine,
      pages: extracted.pages,
      elements: [],
      pageBorder: extracted.page?.border,
      baseDocumentMode: isDocxFile || isPptxFile ? "native" : undefined,
    });
    const nextLayout: TemplateLayout = extracted.variables?.length
      ? {
          ...nextBase,
          variableDefinitions: extracted.variables.map((key) => ({
            key,
            label: labelFromKey(key),
            required: true,
          })),
        }
      : nextBase;

    if (fileType.startsWith("image/")) {
      setBackground(dataUrl);
    } else {
      setBackground(null);
    }

    setLayout((current) => {
      const merged = mode === "replace" ? nextLayout : mergeImportedBase(current, nextLayout);
      return {
        ...merged,
        baseFileName: file.name,
        baseFileType: fileType,
        baseFileDataUrl: dataUrl,
        basePreviewHtml: extracted.previewHtml,
        baseRenderDataUrl: extracted.renderDataUrl,
        baseRenderFileType: extracted.renderFileType,
        baseRenderEngine: extracted.renderEngine,
        baseImageDataUrl: extracted.imageDataUrl,
        baseImageEngine: extracted.imageEngine,
      };
    });
    setSelectedId(nextLayout.elements[0]?.id ?? "");
    setActivePageIndex(nextLayout.elements[0]?.pageIndex ?? 0);
    if (extracted.page) {
      setOrientation(extracted.page.orientation);
      setWidth(extracted.page.width);
      setHeight(extracted.page.height);
    }

    if (!initial) {
      setName(file.name.replace(/\.[^.]+$/, "") || "Novo certificado");
      setDescription(`Modelo enviado a partir de ${file.name}`);
    }
  }

  async function discardAndExit() {
    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: "Descartar modelo",
        message: "Descartar este modelo sem salvar?",
        confirmLabel: "Descartar",
        tone: "danger",
      });
      if (!confirmed) return;
    }

    skipLeaveWarningRef.current = true;
    window.sessionStorage.removeItem(templateImportDraftStorageKey);
    router.push("/modelos");
    router.refresh();
  }

  async function save() {
    setSaving(true);
    const layoutToSave = normalizeVisualDocxLayout(layout);
    const response = await fetch(initial ? `/api/templates/${initial.id}` : "/api/templates", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, width, height, orientation, background, layout: layoutToSave }),
    });
    setSaving(false);
    if (!response.ok) {
      alert("Nao foi possivel salvar o modelo.");
      return;
    }
    setLayout(layoutToSave);
    setSavedSnapshot(buildSnapshot({ name, description, orientation, width, height, background, layout: layoutToSave }));
    skipLeaveWarningRef.current = true;
    router.push("/modelos");
    router.refresh();
  }

  return (
    <div className={`te-root te-root-workspace ${isDocxTemplate ? "te-root-docx" : ""}`}>
      {confirmationDialog}

      {/* ─── Toolbar ─── */}
      <div className="te-toolbar">
        <div className="te-toolbar-heading">
          <span className="te-toolbar-icon">
            {isDocxTemplate ? <FileText /> : <Layers />}
          </span>
          <span>
            <strong>{editorModeLabel}</strong>
            <small>{baseFileLabel}</small>
          </span>
        </div>

        <div className="te-toolbar-divider" />

        <div className="te-toolbar-group">
          <button type="button" onClick={() => addElement("text")} className="te-btn te-btn-icon" title="Adicionar texto">
            <Type />
          </button>
          <button type="button" onClick={() => addElement("variable")} className="te-btn" title="Adicionar campo variável">
            <Plus /> Campo
          </button>
          <button type="button" onClick={() => addElement("qr")} className="te-btn te-btn-icon" title="Adicionar QR Code">
            <QrCode />
          </button>
        </div>

        <div className="te-toolbar-divider" />

        <label className="te-btn" style={{ cursor: "pointer" }} title="Importar arquivo base">
          <RefreshCcw />
          Importar
          <input
            type="file"
                  accept="image/*,.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) await applyBaseFile(file, "replace");
              event.target.value = "";
            }}
          />
        </label>

        <div className="te-toolbar-spacer" />

        {hasUnsavedChanges ? (
          <span className="te-unsaved-badge">Alterações não salvas</span>
        ) : null}

        <button type="button" onClick={discardAndExit} className="te-btn te-btn-danger">
          <X /> Sair
        </button>
        <button type="button" onClick={save} disabled={saving} className="te-btn te-btn-primary">
          <Save />
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {/* ─── Canvas ─── */}
      <aside className="te-document-panel">
          <div className="te-docx-section">
            <div className="te-docx-heading">
              <span className="te-docx-icon">
                {isDocxTemplate ? <FileText /> : <Layers />}
              </span>
              <div>
                <strong>{isDocxTemplate ? "Documento DOCX" : isPptxTemplate ? "Documento PPTX" : "Documento do modelo"}</strong>
                <small>{isDocxTemplate ? "Word / Google Docs" : isPptxTemplate ? "PowerPoint" : "PDF, imagem, DOCX ou PPTX"}</small>
              </div>
            </div>

            <div className="te-docx-file-card">
              <div>
                <span>Arquivo</span>
                <strong>{layout.baseFileName ?? "Nenhum arquivo importado"}</strong>
              </div>
              <span className="te-docx-badge">
                {isDocxTemplate ? (isEditableDocxBase ? "Editavel" : "DOCX") : isPptxTemplate ? "PPTX" : hasImportedBase ? "Base visual" : "Novo"}
              </span>
            </div>

            <label className="te-docx-import">
              <RefreshCcw />
              {hasImportedBase ? "Substituir base" : "Importar base"}
              <input
                type="file"
              accept="image/*,.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await applyBaseFile(file, "replace");
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="te-docx-section">
            <div className="te-docx-stats">
              <div>
                <strong>{editorPages.length}</strong>
                <span>paginas</span>
              </div>
              <div>
                <strong>{allVariables.length}</strong>
                <span>campos</span>
              </div>
            </div>
          </div>

          <div className="te-docx-section">
            <div className="te-docx-section-title">Paginas</div>
            <div className="te-docx-page-list">
              {editorPages.map((page) => (
                <button
                  key={page.index}
                  type="button"
                  className={`te-docx-page ${activePageIndex === page.index ? "active" : ""}`}
                  onClick={() => setActivePageIndex(page.index)}
                >
                  <span>Pagina {page.index + 1}</span>
                  <small>{page.width} x {page.height}px</small>
                </button>
              ))}
            </div>
          </div>
      </aside>

      <section
        ref={previewViewportRef}
        className="te-canvas-area"
        style={{ maxHeight: previewBounds.height ? `${previewBounds.height}px` : undefined }}
      >
        <div className="te-page-stack" style={{ width: previewSize.width, height: previewSize.height }}>
          <div
            className="te-page-stack-inner"
            style={{
              width: pageStackWidth,
              height: pageStackHeight,
              transform: `scale(${scale})`,
            }}
          >
            {editorPages.map((page) => (
              <div
                key={page.index}
                className={`te-canvas-wrapper te-page-frame ${activePageIndex === page.index ? "te-page-active" : ""}`}
                style={{
                  left: Math.round((pageStackWidth - page.width) / 2),
                  top: page.offsetTop,
                  width: page.width,
                  height: page.height,
                }}
              >
                <div className="te-page-label">Pagina {page.index + 1}</div>
                <div
                  className="te-canvas-surface"
                  onClick={(event) => {
                    if (event.currentTarget === event.target) setActivePageIndex(page.index);
                  }}
                  style={{
                    width: page.width,
                    height: page.height,
                    backgroundImage: page.background ? `url(${page.background})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
              {!isEditableDocxBase && hasMultipleEditorPages && !page.background && layout.baseRenderDataUrl && layout.baseRenderFileType === "application/pdf" ? (
                <iframe
                  title={`Preview PDF pagina ${page.index + 1}`}
                  src={pdfPageDataUrl(layout.baseRenderDataUrl, page.index)}
                  className="te-pdf-page-preview"
                />
              ) : null}
              {page.index === 0 && !hasMultipleEditorPages && !isEditableDocxBase && layout.baseRenderDataUrl && layout.baseRenderFileType === "application/pdf" ? (
                <embed
                  src={layout.baseRenderDataUrl}
                  type="application/pdf"
                  className="absolute inset-0 size-full"
                />
              ) : null}
              {page.index === 0 && !hasMultipleEditorPages && !isEditableDocxBase && layout.baseRenderDataUrl && layout.baseRenderFileType?.startsWith("image/") ? (
                <img
                  src={layout.baseRenderDataUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 size-full object-fill"
                />
              ) : null}
              {page.index === 0 && !hasMultipleEditorPages && !isEditableDocxBase && layout.baseFileType === "application/pdf" && layout.baseFileDataUrl && !layout.baseRenderDataUrl ? (
                <embed
                  src={layout.baseFileDataUrl}
                  type="application/pdf"
                  className="absolute inset-0 size-full"
                />
              ) : null}
              {page.index === 0 && !hasMultipleEditorPages && !isEditableDocxBase && !layout.baseRenderDataUrl && layout.baseImageDataUrl ? (
                <img
                  src={layout.baseImageDataUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 size-full object-fill"
                />
              ) : page.index === 0 && !hasMultipleEditorPages && !page.background && !isEditableDocxBase && !layout.baseRenderDataUrl && layout.baseFileType?.includes("wordprocessingml") && layout.baseFileDataUrl ? (
                <DocxPreviewSurface dataUrl={layout.baseFileDataUrl} />
              ) : page.index === 0 && !hasMultipleEditorPages && !page.background && !isEditableDocxBase && !layout.baseRenderDataUrl && layout.baseFileType?.includes("wordprocessingml") && layout.basePreviewHtml ? (
                <iframe
                  title="Preview DOCX"
                  srcDoc={dataUrlToHtmlDocument(layout.basePreviewHtml)}
                  className="absolute inset-0 size-full border-0 bg-white"
                />
              ) : page.index === 0 && !hasMultipleEditorPages && !isEditableDocxBase && layout.baseFileType?.includes("wordprocessingml") && layout.baseFileName && !layout.baseRenderDataUrl && !layout.basePreviewHtml && !layout.baseImageDataUrl ? (
                <div className="absolute inset-0 grid place-items-center bg-slate-50 p-10 text-center">
                  <div>
                    <FileUp className="mx-auto size-12 text-teal-700" />
                    <p className="mt-4 text-lg font-bold text-slate-900">{layout.baseFileName}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      DOCX carregado. Nao foi possivel gerar o preview; o documento sera usado na emissao.
                    </p>
                  </div>
                </div>
              ) : null}
              {isDocxTemplate && hasMultipleEditorPages && !page.background && !(layout.baseRenderDataUrl && layout.baseRenderFileType === "application/pdf") ? (
                <div className="te-page-fallback">
                  <FileText />
                  <span>Pagina {page.index + 1} do DOCX</span>
                </div>
              ) : null}
              {!hasImportedBase ? (
                <>
                  <div className="pointer-events-none absolute inset-6 border-2 border-teal-700" />
                  <div className="pointer-events-none absolute inset-10 border border-slate-400" />
                </>
              ) : null}
              {page.border && !page.background && !layout.baseRenderDataUrl && !layout.baseImageDataUrl ? (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    inset: page.border.inset,
                    border: `${page.border.width}px solid ${page.border.color}`,
                  }}
                />
              ) : null}
              {layout.elements.filter((element) => (element.pageIndex ?? 0) === page.index).map((element) => {
                const isSelected = selectedId === element.id;
                const isTextElement = element.type === "text" || element.type === "variable";
                const isInlineEditing = inlineEditId === element.id && isTextElement;

                return (
                  <div
                    key={element.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Elemento ${element.type}`}
                    onPointerDown={(event) => beginDrag(event, element)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onClick={() => {
                      setSelectedId(element.id);
                      setActivePageIndex(element.pageIndex ?? 0);
                    }}
                    onDoubleClick={() => {
                      setSelectedId(element.id);
                      setActivePageIndex(element.pageIndex ?? 0);
                      if (isTextElement) setInlineEditId(element.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelectedId(element.id);
                      setActivePageIndex(element.pageIndex ?? 0);
                      if (event.key === "Enter" && isTextElement) setInlineEditId(element.id);
                    }}
                    className={`te-element ${isInlineEditing ? "te-element-editing" : ""} ${isSelected ? "te-element-selected" : ""}`}
                    style={{
                      left: element.x,
                      top: element.y,
                      width: element.width,
                      height: element.height,
                      color: element.color,
                      fontFamily: element.fontFamily,
                      fontSize: element.fontSize,
                      fontWeight: element.bold ? 700 : 400,
                      fontStyle: element.italic ? "italic" : "normal",
                      textDecoration: element.underline ? "underline" : "none",
                      alignItems: element.type === "text" ? "flex-start" : "center",
                      justifyContent: element.align === "left" ? "flex-start" : element.align === "right" ? "flex-end" : "center",
                      padding: isTextElement ? "2px 4px" : 0,
                      textAlign: element.align,
                      lineHeight: element.lineHeight,
                    }}
                  >
                    {isInlineEditing ? (
                      <textarea
                        ref={inlineTextareaRef}
                        value={element.content}
                        onChange={(event) => updateElementById(element.id, { content: event.target.value })}
                        onBlur={() => setInlineEditId("")}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
                            event.preventDefault();
                            setInlineEditId("");
                          }
                        }}
                        className="te-inline-textarea"
                        style={{
                          color: element.color,
                          fontFamily: element.fontFamily,
                          fontSize: element.fontSize,
                          fontWeight: element.bold ? 700 : 400,
                          fontStyle: element.italic ? "italic" : "normal",
                          textDecoration: element.underline ? "underline" : "none",
                          textAlign: element.align,
                          lineHeight: element.lineHeight,
                        }}
                      />
                    ) : element.type === "qr" ? (
                      <QrCode className="mx-auto size-16" />
                    ) : element.type === "image" ? (
                      <img src={element.content} alt="" className="pointer-events-none size-full object-contain" />
                    ) : (
                      <span className="block size-full overflow-hidden">{element.content}</span>
                    )}
                    {isSelected ? (
                      <>
                        {RESIZE_HANDLES.map((handle) => (
                          <span
                            key={handle}
                            data-resize-handle
                            role="presentation"
                            onPointerDown={(event) => beginResize(event, element, handle)}
                            onPointerMove={moveResize}
                            onPointerUp={endResize}
                            onPointerCancel={endResize}
                            className={`te-resize-handle te-resize-${handle}`}
                          />
                        ))}
                      </>
                    ) : null}
                  </div>
                );
              })}
                </div>
              </div>
            ))}
            </div>
          </div>
      </section>

      {/* ─── Sidebar ─── */}
      <aside className="te-sidebar">
        {/* File Info */}
        {layout.baseFileName && !isDocxTemplate ? (
          <div className="te-panel">
            <div className="te-panel-title">Arquivo base</div>
            <div className="te-file-info">
              <div className="te-file-info-icon"><FileUp /></div>
              <div className="te-file-info-text">
                <div className="te-file-info-name">{layout.baseFileName}</div>
                <div className="te-file-info-sub">
                  {layout.baseFileType?.includes("wordprocessingml")
                    ? (isEditableDocxBase ? "DOCX convertido em campos editáveis" : "DOCX preservado como base visual")
                    : "Arquivo importado"}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Page Info */}
        {!isDocxTemplate ? (
          <div className="te-panel">
          <div className="te-panel-title">Página</div>
          <div className="te-page-info">
            <strong>{editorPages.length > 1 ? `${editorPages.length} paginas` : pageLabel(orientation, width, height)}</strong>
            <span>·</span>
            <span>ativa {activePageIndex + 1}</span>
          </div>
          {editorPages.length > 1 ? (
            <div className="te-page-list">
              {editorPages.map((page) => (
                <button
                  key={page.index}
                  type="button"
                  className={`te-page-list-item ${activePageIndex === page.index ? "active" : ""}`}
                  onClick={() => setActivePageIndex(page.index)}
                >
                  <span>Pagina {page.index + 1}</span>
                  <small>{page.width} x {page.height}px</small>
                </button>
              ))}
            </div>
          ) : null}
          </div>
        ) : null}

        {/* Quick Placeholders */}
        {!isDocxTemplate ? (
          <div className="te-panel">
          <div className="te-panel-title">Placeholders rápidos</div>
          <div className="te-placeholders">
            {[
              ["nome", "Nome do participante"],
              ["curso", "Curso"],
              ["data", "Data"],
              ["carga_horaria", "Carga horária"],
              ["instrutor", "Instrutor"],
              ["empresa", "Empresa"],
              ["cpf", "CPF"],
              ["codigo", "Código"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => addPlaceholderPreset(key, label)}
                className="te-placeholder-chip"
              >
                {label}
              </button>
            ))}
          </div>
          </div>
        ) : null}

        {/* Variables */}
        <div className="te-panel">
          <div className="te-panel-title">
            {isDocxTemplate ? "Campos do DOCX" : "Variaveis"}
            <button
              type="button"
              onClick={addNewVariableDefinition}
              disabled={!newVariableLabel.trim()}
              className="te-panel-title-action"
            >
              <Plus className="size-3" /> Nova
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.75rem" }}>
            <input
              value={newVariableLabel}
              onChange={(event) => setNewVariableLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addNewVariableDefinition();
              }}
              className="te-var-input"
              style={{ flex: 1 }}
              placeholder="Novo campo"
            />
          </div>
          {allVariables.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontStyle: "italic" }}>
              Nenhuma variável. Use {`{{nome}}`} no documento ou clique em &quot;Nova&quot;.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {allVariables.map((v) => (
                <div key={v.key} className="te-var-row">
                  <code className="te-var-key">{v.key}</code>
                  <input
                    value={v.label}
                    onChange={(e) => updateVariableDefinition(v.key, { label: e.target.value })}
                    className="te-var-input"
                    placeholder="Label no formulário"
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.72rem", color: "var(--text-muted)", flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={v.required}
                      onChange={(e) => updateVariableDefinition(v.key, { required: e.target.checked })}
                      style={{ width: 12, height: 12 }}
                    />
                    Obr.
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Template Settings */}
        <div className="te-panel">
          <div className="te-panel-title">Configurações</div>
          <div className="te-prop-section">
            <label className="field">
              <span>Nome</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field" style={{ marginTop: "0.5rem" }}>
              <span>Descrição</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            {!isDocxTemplate ? (
              <>
                <div className="te-prop-grid" style={{ marginTop: "0.5rem" }}>
                  <label className="field">
                    <span>Largura</span>
                    <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
                  </label>
                  <label className="field">
                    <span>Altura</span>
                    <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
                  </label>
                </div>
                <label className="field" style={{ marginTop: "0.5rem" }}>
                  <span>Orientação</span>
                  <select value={orientation} onChange={(event) => applyPagePreset(event.target.value)}>
                    <option value="landscape">Paisagem</option>
                    <option value="portrait">Retrato</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
        </div>

        {/* Selected Element Properties */}
        {selected ? (
          <div className="te-panel">
            <div className="te-element-actions">
              <span className="te-element-actions-title">Elemento selecionado</span>
              <div className="te-toolbar-group">
                <button type="button" className="te-btn te-btn-icon" onClick={duplicateSelectedElement} title="Duplicar elemento">
                  <Copy />
                </button>
                <button type="button" className="te-btn te-btn-icon te-btn-danger" onClick={deleteSelectedElement} title="Excluir elemento">
                  <Trash2 />
                </button>
              </div>
            </div>

            {selected.type === "text" || selected.type === "variable" ? (
              <div className="te-prop-section">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span className="te-prop-section-title" style={{ margin: 0 }}>Texto</span>
                  <button
                    type="button"
                    onClick={() => setInlineEditId(selected.id)}
                    className="te-btn"
                    style={{ height: "1.625rem", fontSize: "0.72rem" }}
                  >
                    Editar na folha
                  </button>
                </div>

                <label className="field">
                  <span>Conteúdo</span>
                  <textarea
                    ref={contentTextareaRef}
                    value={selected.content}
                    className="min-h-40 font-mono text-sm"
                    onChange={(event) => {
                      updateElement({ content: event.target.value });
                      syncContentSelection();
                    }}
                    onSelect={syncContentSelection}
                    onMouseUp={syncContentSelection}
                    onKeyUp={syncContentSelection}
                    onFocus={syncContentSelection}
                  />
                </label>

                <div className="te-prop-grid" style={{ marginTop: "0.5rem" }}>
                  <label className="field">
                    <span>Fonte</span>
                    <select value={selected.fontFamily} onChange={(event) => updateElement({ fontFamily: event.target.value })}>
                      {FONT_OPTIONS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Tamanho</span>
                    <input type="number" min={6} max={120} value={selected.fontSize} onChange={(event) => updateElement({ fontSize: Number(event.target.value) })} />
                  </label>
                  <label className="field">
                    <span>Altura linha</span>
                    <select value={selected.lineHeight} onChange={(event) => updateElement({ lineHeight: Number(event.target.value) })}>
                      {LINE_HEIGHT_OPTIONS.map((lineHeight) => (
                        <option key={lineHeight} value={lineHeight}>
                          {lineHeight}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Cor</span>
                    <input type="color" value={selected.color} onChange={(event) => updateElement({ color: event.target.value })} />
                  </label>
                </div>

                <div className="te-format-bar" style={{ marginTop: "0.5rem" }}>
                  {[
                    ["left", AlignLeft],
                    ["center", AlignCenter],
                    ["right", AlignRight],
                  ].map(([align, Icon]) => (
                    <button
                      key={String(align)}
                      type="button"
                      className={`te-format-btn ${selected.align === align ? "active" : ""}`}
                      onClick={() => updateElement({ align: align as "left" | "center" | "right" })}
                      title={`Alinhar ${align}`}
                    >
                      <Icon />
                    </button>
                  ))}
                  <button type="button" className={`te-format-btn ${selected.bold ? "active" : ""}`} onClick={() => updateElement({ bold: !selected.bold })} title="Negrito">
                    B
                  </button>
                  <button type="button" className={`te-format-btn ${selected.italic ? "active" : ""}`} onClick={() => updateElement({ italic: !selected.italic })} title="Itálico">
                    <Italic />
                  </button>
                  <button type="button" className={`te-format-btn ${selected.underline ? "active" : ""}`} onClick={() => updateElement({ underline: !selected.underline })} title="Sublinhado">
                    <Underline />
                  </button>
                </div>

                <div className="grid gap-2">
                  <label className="field">
                    <span>Inserir variavel no cursor</span>
                    <select
                      value=""
                      onChange={(event) => {
                        const key = event.target.value;
                        const variable = allVariables.find((item) => item.key === key);
                        if (key) insertVariableAtCursor(key, variable?.label);
                      }}
                    >
                      <option value="">Selecionar variavel</option>
                      {allVariables.map((variable) => (
                        <option key={variable.key} value={variable.key}>
                          {variable.label} ({`{{${variable.key}}}`})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!canTransformContent}
                    onClick={transformContentSelectionToVariable}
                    className="te-btn" style={{ width: "100%", justifyContent: "center" }}
                  >
                    <Plus />
                    {selectedContentText ? "Transformar seleção em variável" : "Converter elemento em variável"}
                  </button>
                </div>

                {selectedContentVariables.length ? (
                  <div className="te-placeholders" style={{ marginTop: "0.375rem" }}>
                    {selectedContentVariables.map((key) => (
                      <code key={key} className="te-var-key">
                        {`{{${key}}}`}
                      </code>
                    ))}
                  </div>
                ) : null}

                {selectedVariableIssues.length ? (
                  <div className="te-warning">
                    {selectedVariableIssues.join(" ")}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selected.type === "variable" ? (
              <div className="te-prop-section" style={{ marginTop: "0.625rem" }}>
                <div className="te-prop-section-title">Campo</div>
                <label className="field">
                  <span>Label no formulário</span>
                  <input
                    value={selected.variableLabel ?? labelFromKey(selected.variableKey ?? "")}
                    placeholder="Ex: Nome do participante"
                    onChange={(event) => updateElement({ variableLabel: event.target.value })}
                  />
                </label>
                <label className="field" style={{ marginTop: "0.375rem" }}>
                  <span>Nome técnico</span>
                  <input
                    value={selected.variableKey ?? ""}
                    placeholder="Ex: nome_participante"
                    onChange={(event) => {
                      const key = normalizeVariableKey(event.target.value);
                      updateElement({
                        variableKey: key,
                        content: `{{${key}}}`,
                        variableLabel: selected.variableLabel || labelFromKey(key),
                      });
                    }}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", marginTop: "0.375rem" }}>
                  <input
                    type="checkbox"
                    checked={selected.variableRequired}
                    onChange={(event) => updateElement({ variableRequired: event.target.checked })}
                    style={{ width: 16, height: 16 }}
                  />
                  Campo obrigatório
                </label>
              </div>
            ) : null}

            <div className="te-prop-section" style={{ marginTop: "0.625rem" }}>
              <div className="te-prop-section-title">Posição e tamanho</div>
              <div className="te-prop-grid">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key} className="field">
                    <span>{key.toUpperCase()}</span>
                    <input type="number" value={selected[key]} onChange={(event) => updateElement({ [key]: Number(event.target.value) })} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

type EditorPage = {
  index: number;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
  offsetTop: number;
  background?: string;
  border?: TemplateLayoutPage["border"];
};

const PAGE_LABEL_SPACE = 34;
const PAGE_STACK_GAP = 96;

function buildEditorPages({
  layout,
  width,
  height,
  orientation,
  background,
}: {
  layout: TemplateLayout;
  width: number;
  height: number;
  orientation: string;
  background: string | null;
}): EditorPage[] {
  const basePages = layout.basePages ?? [];
  const hasPageImages = basePages.some((page) => Boolean(page.imageDataUrl));
  const hasMultiPageElements = layout.elements.some((element) => (element.pageIndex ?? 0) > 0);
  const shouldUseBasePages = hasUsableBasePages(basePages) || (basePages.length > 0 && (hasPageImages || hasMultiPageElements));
  const normalizedOrientation: "landscape" | "portrait" = orientation === "portrait" ? "portrait" : "landscape";
  const sourcePages = shouldUseBasePages
    ? basePages
    : [{
        index: 0,
        width,
        height,
        orientation: normalizedOrientation,
        imageDataUrl: layout.baseImageDataUrl ?? undefined,
        border: layout.basePageBorder,
      }];
  const pages: Array<Omit<EditorPage, "offsetTop">> = sourcePages
    .map((page, index) => ({
      index: page.index ?? index,
      width: positiveNumberOrDefault(page.width, width),
      height: positiveNumberOrDefault(page.height, height),
      orientation: page.orientation === "portrait" ? "portrait" : page.orientation === "landscape" ? "landscape" : normalizedOrientation,
      background: page.imageDataUrl ?? (index === 0 ? background ?? undefined : undefined),
      border: page.border ?? (index === 0 ? layout.basePageBorder : undefined),
    }))
    .sort((a, b) => a.index - b.index);
  const maxElementPageIndex = Math.max(0, ...layout.elements.map((element) => element.pageIndex ?? 0));

  for (let index = pages.length; index <= maxElementPageIndex; index += 1) {
    pages.push({
      index,
      width,
      height,
      orientation: normalizedOrientation,
      background: undefined,
      border: undefined,
    });
  }

  let offsetTop = PAGE_LABEL_SPACE;
  return pages.map((page, index) => {
    const next = { ...page, offsetTop };
    offsetTop += page.height + (index < pages.length - 1 ? PAGE_STACK_GAP : 0);
    return next;
  });
}

function hasUsableBasePages(pages: TemplateLayoutPage[] | undefined) {
  return Boolean(pages?.length && (pages.length > 1 || pages.some((page) => Boolean(page.imageDataUrl))));
}

function isDocxLayout(layout: TemplateLayout) {
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl?.toLowerCase() ?? "";

  return (
    fileType.includes("wordprocessingml") ||
    fileName.endsWith(".docx") ||
    dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml")
  );
}

function isPptxLayout(layout: TemplateLayout) {
  const fileType = layout.baseFileType?.toLowerCase() ?? "";
  const fileName = layout.baseFileName?.toLowerCase() ?? "";
  const dataUrl = layout.baseFileDataUrl?.toLowerCase() ?? "";

  return (
    fileType.includes("presentationml") ||
    fileName.endsWith(".pptx") ||
    dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.presentationml")
  );
}

function isOfficeSource(
  fileName: string | undefined,
  fileType: string | undefined,
  dataUrl: string | undefined,
) {
  const lowerName = fileName?.toLowerCase() ?? "";
  const lowerType = fileType?.toLowerCase() ?? "";
  const lowerDataUrl = dataUrl?.toLowerCase() ?? "";

  return (
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".pptx") ||
    lowerType.includes("wordprocessingml") ||
    lowerType.includes("presentationml") ||
    lowerDataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml") ||
    lowerDataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.presentationml")
  );
}

function findEditorPage(pages: EditorPage[], pageIndex: number | undefined) {
  return pages.find((page) => page.index === (pageIndex ?? 0)) ?? pages[0] ?? {
    index: 0,
    width: 1123,
    height: 794,
    orientation: "landscape" as const,
    offsetTop: 0,
  };
}

function pdfPageDataUrl(dataUrl: string, pageIndex: number) {
  return `${dataUrl}#page=${pageIndex + 1}&toolbar=0&navpanes=0&scrollbar=0&view=Fit`;
}

function DocxPreviewSurface({ dataUrl }: { dataUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setRenderFailed(false);
    container.innerHTML = "";

    async function renderPreview() {
      try {
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !container) return;

        await renderAsync(dataUrlToUint8Array(dataUrl), container, undefined, {
          className: "docx-render",
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      } catch (error) {
        console.error("Falha ao renderizar preview DOCX", error);
        if (!cancelled) setRenderFailed(true);
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [dataUrl]);

  return (
    <div className="docx-preview-surface absolute inset-0 overflow-hidden bg-white">
      <div ref={containerRef} className="size-full" />
      {renderFailed ? (
        <div className="absolute inset-0 grid place-items-center bg-white p-8 text-center text-sm font-semibold text-slate-600">
          Nao foi possivel renderizar o DOCX.
        </div>
      ) : null}
    </div>
  );
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function guessFileType(fileName: string) {
  if (fileName.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (fileName.toLowerCase().endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (fileName.toLowerCase().endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/octet-stream";
}

function parseImportDraft(rawDraft: string): TemplateImportDraft {
  const parsed = JSON.parse(rawDraft) as Partial<TemplateImportDraft>;
  const orientation = parsed.orientation === "portrait" ? "portrait" : "landscape";
  const preset = PAGE_PRESETS[orientation];

  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "Novo certificado",
    description: typeof parsed.description === "string" ? parsed.description : "",
    width: positiveNumberOrDefault(parsed.width, preset.width),
    height: positiveNumberOrDefault(parsed.height, preset.height),
    orientation,
    background: typeof parsed.background === "string" ? parsed.background : null,
    layout: templateLayoutSchema.parse(parsed.layout ?? defaultLayout()),
  };
}

function positiveNumberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pageLabel(orientation: string, width: number, height: number) {
  const preset = PAGE_PRESETS[orientation as keyof typeof PAGE_PRESETS];
  if (preset && preset.width === width && preset.height === height) return preset.label;
  return "personalizada";
}

function mergeImportedBase(current: TemplateLayout, nextBase: TemplateLayout): TemplateLayout {
  if (isDefaultStarterLayout(current)) {
    return nextBase;
  }

  return {
    ...current,
    baseDocumentMode: nextBase.baseDocumentMode,
    basePages: nextBase.basePages,
    baseFileName: nextBase.baseFileName,
    baseFileType: nextBase.baseFileType,
    baseFileDataUrl: nextBase.baseFileDataUrl,
    basePreviewHtml: nextBase.basePreviewHtml,
    baseRenderDataUrl: nextBase.baseRenderDataUrl,
    baseRenderFileType: nextBase.baseRenderFileType,
    baseRenderEngine: nextBase.baseRenderEngine,
    baseImageDataUrl: nextBase.baseImageDataUrl,
    baseImageEngine: nextBase.baseImageEngine,
    basePageBorder: nextBase.basePageBorder,
    variableDefinitions: nextBase.variableDefinitions ?? current.variableDefinitions,
    elements: mergeImportedElements(current.elements, nextBase.elements),
  };
}

function mergeImportedElements(currentElements: TemplateElement[], importedElements: TemplateElement[]) {
  const existingVariableKeys = new Set(
    currentElements
      .map((element) => (element.type === "variable" ? `${element.pageIndex ?? 0}:${element.variableKey}` : undefined))
      .filter(Boolean),
  );
  const existingContents = new Set(currentElements.map((element) => `${element.pageIndex ?? 0}:${element.content.trim()}`).filter(Boolean));

  const additions = importedElements.filter((element) => {
    if (element.type === "variable" && element.variableKey) {
      return !existingVariableKeys.has(`${element.pageIndex ?? 0}:${element.variableKey}`);
    }

    const content = element.content.trim();
    return !content || !existingContents.has(`${element.pageIndex ?? 0}:${content}`);
  });

  return [...currentElements, ...additions];
}

function buildSnapshot({
  name,
  description,
  orientation,
  width,
  height,
  background,
  layout,
}: {
  name: string;
  description: string;
  orientation: string;
  width: number;
  height: number;
  background: string | null;
  layout: TemplateLayout;
}) {
  return JSON.stringify({
    name,
    description,
    orientation,
    width,
    height,
    background,
    layout,
  });
}

function duplicateElement(element: TemplateElement, pageWidth: number, pageHeight: number): TemplateElement {
  const offset = 18;
  return {
    ...element,
    id: `${element.type}-${crypto.randomUUID()}`,
    x: clamp(element.x + offset, 0, Math.max(0, pageWidth - element.width)),
    y: clamp(element.y + offset, 0, Math.max(0, pageHeight - element.height)),
  };
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isResizeHandleTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("[data-resize-handle]"));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSelectedContentRange(content: string, selection: TextSelection): TextSelection {
  const start = clamp(Math.min(selection.start, selection.end), 0, content.length);
  const end = clamp(Math.max(selection.start, selection.end), 0, content.length);
  return { start, end };
}

function suggestVariableLabel(value: string) {
  const singleLine = value.replace(/\s+/g, " ").trim();
  if (!singleLine) return "Novo campo";
  return singleLine.length > 60 ? singleLine.slice(0, 57).trimEnd() + "..." : singleLine;
}

function findVariableIssues(content: string) {
  const issues: string[] = [];
  const openCount = content.match(/\{\{/g)?.length ?? 0;
  const closeCount = content.match(/\}\}/g)?.length ?? 0;

  if (openCount !== closeCount) {
    issues.push("Ha chaves de variavel sem fechamento.");
  }

  for (const match of content.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    if (!normalizeVariableKey(match[1])) {
      issues.push("Ha uma variavel sem nome valido.");
    }
  }

  const textWithoutValidVariables = content.replace(/\{\{\s*[^{}]+?\s*\}\}/g, "");
  if (textWithoutValidVariables.includes("{{") || textWithoutValidVariables.includes("}}")) {
    issues.push("Revise o formato das variaveis: use {{nome_do_campo}}.");
  }

  return [...new Set(issues)];
}

function uniqueVariableKey(baseKey: string, layout: TemplateLayout) {
  const usedKeys = new Set<string>();

  for (const definition of layout.variableDefinitions ?? []) {
    if (definition.key) usedKeys.add(definition.key);
  }

  for (const element of layout.elements) {
    if (element.variableKey) usedKeys.add(element.variableKey);
  }

  let key = baseKey;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  return key;
}

function upsertVariableDefinition(layout: TemplateLayout, definition: TemplateVariableDefinition): TemplateLayout {
  return {
    ...layout,
    variableDefinitions: [
      ...(layout.variableDefinitions ?? []).filter((item) => item.key !== definition.key),
      definition,
    ],
  };
}
