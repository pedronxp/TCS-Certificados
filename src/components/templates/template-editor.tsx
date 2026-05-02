"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignLeft, AlignRight, FileUp, ImagePlus, Plus, QrCode, RefreshCcw, Save, Trash2, Type, X } from "lucide-react";
import {
  defaultLayout,
  extractVariableKeys,
  isDefaultStarterLayout,
  labelFromKey,
  normalizeVariableKey,
  templateLayoutSchema,
  uploadedBaseLayout,
  type TemplateElement,
  type TemplateLayout,
  type TemplateVariableDefinition,
} from "@/lib/certificate-layout";
import { useConfirmDialog } from "@/components/confirmation-dialog";
import { dataUrlToHtmlDocument, extractDocumentPreview } from "@/lib/document-extract.client";
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

const PAGE_PRESETS = {
  landscape: { label: "A4 paisagem", width: 1123, height: 794 },
  portrait: { label: "A4 retrato", width: 794, height: 1123 },
} as const;

const LEAVE_WARNING =
  "Voce tem alteracoes nao salvas. Se sair agora, vai perder o que foi mudado. Deseja sair mesmo?";

export function TemplateEditor({ initial }: TemplateEditorProps) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();
  const initialLayout = useMemo(() => initial?.layout ?? defaultLayout(), [initial?.layout]);
  const [name, setName] = useState(initial?.name ?? "Novo certificado");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [orientation, setOrientation] = useState(initial?.orientation ?? "landscape");
  const [width, setWidth] = useState(initial?.width ?? 1123);
  const [height, setHeight] = useState(initial?.height ?? 794);
  const [background, setBackground] = useState<string | null>(initial?.background ?? null);
  const [layout, setLayout] = useState<TemplateLayout>(() => initialLayout);
  const [selectedId, setSelectedId] = useState(initialLayout.elements[0]?.id ?? "");
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
  const [contentSelection, setContentSelection] = useState<TextSelection>({ start: 0, end: 0 });
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const selected = layout.elements.find((element) => element.id === selectedId) ?? layout.elements[0];
  const currentSnapshot = useMemo(
    () => buildSnapshot({ name, description, orientation, width, height, background, layout }),
    [background, description, height, layout, name, orientation, width],
  );
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot;
  const scale = useMemo(() => {
    const availableWidth = Math.max(280, (previewBounds.width || 900) - 16);
    const availableHeight = Math.max(320, (previewBounds.height || 680) - 16);
    return Math.max(0.28, Math.min(1, availableWidth / width, availableHeight / height));
  }, [height, previewBounds.height, previewBounds.width, width]);
  const previewSize = useMemo(
    () => ({ width: Math.ceil(width * scale), height: Math.ceil(height * scale) }),
    [height, scale, width],
  );
  const selectedContentRange = getSelectedContentRange(selected?.content ?? "", contentSelection);
  const selectedContentText = selected?.content.slice(selectedContentRange.start, selectedContentRange.end).trim() ?? "";
  const canTransformContent = Boolean(
    selected &&
      (selected.type === "text" || selected.type === "variable") &&
      (selectedContentText || selected.content.trim()),
  );
  const hasImportedBase = Boolean(background || layout.baseRenderDataUrl || layout.baseImageDataUrl || layout.baseFileDataUrl || layout.basePreviewHtml);
  const allVariables = useMemo(() => {
    const map = new Map<string, { label: string; required: boolean }>();
    for (const key of extractVariableKeys(layout.basePreviewHtml ?? "")) {
      map.set(key, { label: labelFromKey(key), required: true });
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
  }, [layout.basePreviewHtml, layout.elements, layout.variableDefinitions]);

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

    let timeoutId: number | undefined;

    try {
      const draft = parseImportDraft(rawDraft);

      timeoutId = window.setTimeout(() => {
        setName(draft.name);
        setDescription(draft.description);
        setOrientation(draft.orientation);
        setWidth(draft.width);
        setHeight(draft.height);
        setBackground(draft.background);
        setLayout(draft.layout);
        setSelectedId(draft.layout.elements[0]?.id ?? "");
        skipLeaveWarningRef.current = false;
      }, 0);
    } catch {
      alert("Nao foi possivel carregar o rascunho importado.");
    } finally {
      window.sessionStorage.removeItem(templateImportDraftStorageKey);
    }

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [initial]);

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

  function updateElement(patch: Partial<TemplateElement>) {
    if (!selected) return;
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === selected.id ? { ...element, ...patch } : element,
      ),
    }));
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

    const defaultLabel = suggestVariableLabel(fallbackText);
    const label = window.prompt("Label do campo no formulario", defaultLabel)?.trim();
    if (!label) return;

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

  function addElement(type: TemplateElement["type"]) {
    addField(type);
  }

  function addField(type: TemplateElement["type"], preset?: { key: string; label: string }) {
    const id = `${type}-${crypto.randomUUID()}`;
    const variableKey = preset?.key ?? "nova_variavel";
    const variableLabel = preset?.label ?? "Nova variavel";
    const element: TemplateElement = {
      id,
      type,
      content: type === "variable" ? `{{${variableKey}}}` : type === "text" ? "Novo texto" : "",
      variableKey: type === "variable" ? variableKey : undefined,
      variableLabel: type === "variable" ? variableLabel : undefined,
      variableRequired: true,
      x: 120,
      y: 120,
      width: type === "qr" ? 110 : 280,
      height: type === "qr" ? 110 : 60,
      fontSize: 28,
      fontFamily: "Arial",
      color: "#111827",
      align: "center",
      bold: false,
    };
    setLayout((current) => ({ ...current, elements: [...current.elements, element] }));
    setSelectedId(id);
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
    const label = window.prompt("Nome do campo (ex: Nome do participante)")?.trim();
    if (!label) return;
    const key = uniqueVariableKey(normalizeVariableKey(label) || "campo", layout);
    setLayout((current) => upsertVariableDefinition(current, { key, label, required: true }));
  }

  function applyPagePreset(nextOrientation: string) {
    const preset = PAGE_PRESETS[nextOrientation as keyof typeof PAGE_PRESETS];
    setOrientation(nextOrientation);
    if (preset) {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, element: TemplateElement) {
    if (event.button !== 0) return;
    setSelectedId(element.id);
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

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaX = (event.clientX - drag.startX) / scale;
    const deltaY = (event.clientY - drag.startY) / scale;

    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== drag.id) return element;
        return {
          ...element,
          x: clamp(Math.round(drag.originX + deltaX), 0, Math.max(0, width - element.width)),
          y: clamp(Math.round(drag.originY + deltaY), 0, Math.max(0, height - element.height)),
        };
      }),
    }));
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
    dragRef.current = null;
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
      elements: extracted.elements,
      pageBorder: extracted.page?.border,
    });

    if (fileType.startsWith("image/")) {
      setBackground(dataUrl);
    } else {
      setBackground(null);
    }

    setLayout((current) => {
      const merged = mode === "replace" ? nextBase : mergeImportedBase(current, nextBase);
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
    setSelectedId(nextBase.elements[0]?.id ?? "");
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
    const response = await fetch(initial ? `/api/templates/${initial.id}` : "/api/templates", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, width, height, orientation, background, layout }),
    });
    setSaving(false);
    if (!response.ok) {
      alert("Nao foi possivel salvar o modelo.");
      return;
    }
    setSavedSnapshot(buildSnapshot({ name, description, orientation, width, height, background, layout }));
    skipLeaveWarningRef.current = true;
    router.push("/modelos");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
      {confirmationDialog}
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => addElement("text")} className="icon-button" title="Adicionar texto">
            <Type className="size-4" />
          </button>
          <button type="button" onClick={() => addElement("variable")} className="icon-button" title="Adicionar variavel">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={() => addElement("variable")} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Plus className="size-4" />
            Campo
          </button>
          <button type="button" onClick={() => addElement("qr")} className="icon-button" title="Adicionar QR Code">
            <QrCode className="size-4" />
          </button>
          <label className="icon-button cursor-pointer" title="Importar novamente e substituir modelo atual">
            <ImagePlus className="size-4" />
            <input
              type="file"
              accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await applyBaseFile(file, "replace");
                event.target.value = "";
              }}
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCcw className="size-4" />
            Importar novamente
            <input
              type="file"
              accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await applyBaseFile(file, "replace");
                event.target.value = "";
              }}
            />
          </label>
          {hasUnsavedChanges ? (
            <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              Alteracoes nao salvas
            </span>
          ) : null}
          <button type="button" onClick={discardAndExit} className={`${hasUnsavedChanges ? "" : "ml-auto"} inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50`}>
            <X className="size-4" />
            Sair sem salvar
          </button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            <Save className="size-4" />
            {saving ? "Salvando" : "Salvar"}
          </button>
        </div>

        <div
          ref={previewViewportRef}
          className="overflow-auto rounded-lg bg-slate-200 p-2 sm:p-3"
          style={{ maxHeight: previewBounds.height ? `${previewBounds.height}px` : undefined }}
        >
          <div
            className="relative mx-auto"
            style={{
              width: previewSize.width,
              height: previewSize.height,
            }}
          >
            <div
              className="relative origin-top-left overflow-hidden bg-white shadow-sm"
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                backgroundImage: background ? `url(${background})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {layout.baseRenderDataUrl && layout.baseRenderFileType === "application/pdf" ? (
                <embed
                  src={layout.baseRenderDataUrl}
                  type="application/pdf"
                  className="absolute inset-0 size-full"
                />
              ) : null}
              {layout.baseRenderDataUrl && layout.baseRenderFileType?.startsWith("image/") ? (
                <img
                  src={layout.baseRenderDataUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 size-full object-fill"
                />
              ) : null}
              {layout.baseFileType === "application/pdf" && layout.baseFileDataUrl && !layout.baseRenderDataUrl ? (
                <embed
                  src={layout.baseFileDataUrl}
                  type="application/pdf"
                  className="absolute inset-0 size-full"
                />
              ) : null}
              {!layout.baseRenderDataUrl && layout.baseImageDataUrl ? (
                <img
                  src={layout.baseImageDataUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 size-full object-fill"
                />
              ) : !layout.baseRenderDataUrl && layout.baseFileType?.includes("wordprocessingml") && layout.baseFileDataUrl ? (
                <DocxPreviewSurface dataUrl={layout.baseFileDataUrl} />
              ) : !layout.baseRenderDataUrl && layout.baseFileType?.includes("wordprocessingml") && layout.basePreviewHtml ? (
                <iframe
                  title="Preview DOCX"
                  srcDoc={dataUrlToHtmlDocument(layout.basePreviewHtml)}
                  className="absolute inset-0 size-full border-0 bg-white"
                />
              ) : layout.baseFileType?.includes("wordprocessingml") && layout.baseFileName && !layout.baseRenderDataUrl && !layout.basePreviewHtml && !layout.baseImageDataUrl ? (
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
              {!hasImportedBase ? (
                <>
                  <div className="pointer-events-none absolute inset-6 border-2 border-teal-700" />
                  <div className="pointer-events-none absolute inset-10 border border-slate-400" />
                </>
              ) : null}
              {layout.basePageBorder && !layout.baseRenderDataUrl && !layout.baseImageDataUrl ? (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    inset: layout.basePageBorder.inset,
                    border: `${layout.basePageBorder.width}px solid ${layout.basePageBorder.color}`,
                  }}
                />
              ) : null}
              {layout.elements.map((element) => (
                <button
                  key={element.id}
                  type="button"
                  onPointerDown={(event) => beginDrag(event, element)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onClick={() => setSelectedId(element.id)}
                  className={`absolute flex touch-none cursor-move overflow-hidden border text-left ${selectedId === element.id ? "border-teal-700 ring-2 ring-teal-200" : "border-transparent hover:border-slate-300"}`}
                  style={{
                    left: element.x,
                    top: element.y,
                    width: element.width,
                    height: element.height,
                    color: element.color,
                    fontFamily: element.fontFamily,
                    fontSize: element.fontSize,
                    fontWeight: element.bold ? 700 : 400,
                    alignItems: element.type === "text" ? "flex-start" : "center",
                    justifyContent: element.align === "left" ? "flex-start" : element.align === "right" ? "flex-end" : "center",
                    padding: element.type === "text" || element.type === "variable" ? "2px 4px" : 0,
                    textAlign: element.align,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.15,
                    wordBreak: "break-word",
                  }}
                >
                  {element.type === "qr" ? (
                    <QrCode className="mx-auto size-16" />
                  ) : element.type === "image" ? (
                    <img src={element.content} alt="" className="pointer-events-none size-full object-contain" />
                  ) : (
                    element.content
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <aside className="min-w-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 xl:max-h-[calc(100vh-7rem)]">
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-teal-300 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900 hover:bg-teal-100">
            <FileUp className="size-5" />
            <span>Importar novamente</span>
            <input
              type="file"
              accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await applyBaseFile(file, "replace");
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={discardAndExit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <X className="size-4" />
            Sair sem salvar
          </button>
          {layout.baseFileName ? (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
              Modelo: {layout.baseFileName}
              {layout.baseFileType?.includes("wordprocessingml") ? (
                <p className="mt-1 font-normal text-slate-500">
                  DOCX preservado como base visual.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <p className="font-bold text-slate-800">
              Folha gerada: {PAGE_PRESETS[orientation as keyof typeof PAGE_PRESETS]?.label ?? "personalizada"}
            </p>
            <p className="mt-1">{width} x {height}px</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Placeholders rapidos</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["nome", "Nome do participante"],
                ["curso", "Curso"],
                ["data", "Data"],
                ["carga_horaria", "Carga horaria"],
                ["instrutor", "Instrutor"],
                ["empresa", "Empresa"],
                ["cpf", "CPF"],
                ["codigo", "Codigo"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => addPlaceholderPreset(key, label)}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase text-teal-700">Variáveis</p>
              <button
                type="button"
                onClick={addNewVariableDefinition}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900"
              >
                <Plus className="size-3" />
                Nova
              </button>
            </div>
            {allVariables.length === 0 ? (
              <p className="text-xs italic text-teal-600">
                Nenhuma variável. Use {`{{nome}}`} no documento ou clique em &quot;Nova&quot;.
              </p>
            ) : (
              <div className="space-y-2">
                {allVariables.map((v) => (
                  <div key={v.key} className="flex items-center gap-1.5">
                    <code className="shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-xs font-mono text-teal-800">
                      {v.key}
                    </code>
                    <input
                      value={v.label}
                      onChange={(e) => updateVariableDefinition(v.key, { label: e.target.value })}
                      className="min-w-0 flex-1 rounded border border-teal-200 bg-white px-2 py-0.5 text-xs"
                      placeholder="Label no formulário"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-teal-600">
                      <input
                        type="checkbox"
                        checked={v.required}
                        onChange={(e) => updateVariableDefinition(v.key, { required: e.target.checked })}
                        className="size-3"
                      />
                      Obr.
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Descricao</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>Largura</span>
              <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Altura</span>
              <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
            </label>
          </div>
          <label className="field">
            <span>Orientacao</span>
            <select value={orientation} onChange={(event) => applyPagePreset(event.target.value)}>
              <option value="landscape">Paisagem</option>
              <option value="portrait">Retrato</option>
            </select>
          </label>
        </div>

        {selected ? (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Elemento selecionado</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setLayout((current) => ({ ...current, elements: current.elements.filter((item) => item.id !== selected.id) }));
                  setSelectedId("");
                }}
                title="Excluir elemento"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              {selected.type === "text" || selected.type === "variable" ? (
                <div className="space-y-2">
                  <label className="field">
                    <span>Conteudo</span>
                    <textarea
                      ref={contentTextareaRef}
                      value={selected.content}
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
                  <button
                    type="button"
                    disabled={!canTransformContent}
                    onClick={transformContentSelectionToVariable}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-teal-600 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    {selectedContentText ? "Transformar selecao em variavel" : "Converter elemento em variavel"}
                  </button>
                </div>
              ) : null}
              {selected.type === "variable" ? (
                <div className="space-y-4 rounded-md border border-teal-100 bg-teal-50 p-3">
                  <label className="field">
                    <span>Label no formulario</span>
                    <input
                      value={selected.variableLabel ?? labelFromKey(selected.variableKey ?? "")}
                      placeholder="Ex: Nome do participante"
                      onChange={(event) => updateElement({ variableLabel: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Nome tecnico</span>
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
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.variableRequired}
                      onChange={(event) => updateElement({ variableRequired: event.target.checked })}
                      className="size-4"
                    />
                    Campo obrigatorio
                  </label>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "width", "height", "fontSize"] as const).map((key) => (
                  <label key={key} className="field">
                    <span>{key}</span>
                    <input type="number" value={selected[key]} onChange={(event) => updateElement({ [key]: Number(event.target.value) })} />
                  </label>
                ))}
                <label className="field">
                  <span>Cor</span>
                  <input type="color" value={selected.color} onChange={(event) => updateElement({ color: event.target.value })} />
                </label>
              </div>
              <div className="flex gap-2">
                {[
                  ["left", AlignLeft],
                  ["center", AlignCenter],
                  ["right", AlignRight],
                ].map(([align, Icon]) => (
                  <button key={String(align)} type="button" className="icon-button" onClick={() => updateElement({ align: align as "left" | "center" | "right" })}>
                    <Icon className="size-4" />
                  </button>
                ))}
                <button type="button" className="rounded-md border border-slate-300 px-3 text-sm font-bold" onClick={() => updateElement({ bold: !selected.bold })}>
                  B
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
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

function mergeImportedBase(current: TemplateLayout, nextBase: TemplateLayout): TemplateLayout {
  if (isDefaultStarterLayout(current)) {
    return nextBase;
  }

  return {
    ...current,
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
    elements: mergeImportedElements(current.elements, nextBase.elements),
  };
}

function mergeImportedElements(currentElements: TemplateElement[], importedElements: TemplateElement[]) {
  const existingVariableKeys = new Set(
    currentElements
      .map((element) => (element.type === "variable" ? element.variableKey : undefined))
      .filter(Boolean),
  );
  const existingContents = new Set(currentElements.map((element) => element.content.trim()).filter(Boolean));

  const additions = importedElements.filter((element) => {
    if (element.type === "variable" && element.variableKey) {
      return !existingVariableKeys.has(element.variableKey);
    }

    const content = element.content.trim();
    return !content || !existingContents.has(content);
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
