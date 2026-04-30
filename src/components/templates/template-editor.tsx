"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignLeft, AlignRight, FileUp, ImagePlus, Plus, Save, Trash2, Type } from "lucide-react";
import { defaultLayout, isDefaultStarterLayout, labelFromKey, normalizeVariableKey, stripQrElements, templateLayoutSchema, uploadedBaseLayout, type TemplateElement, type TemplateLayout } from "@/lib/certificate-layout";
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

type EditableElementType = Exclude<TemplateElement["type"], "qr">;

const PAGE_PRESETS = {
  landscape: { label: "A4 paisagem", width: 1123, height: 794 },
  portrait: { label: "A4 retrato", width: 794, height: 1123 },
} as const;

const LEAVE_WARNING =
  "Você tem alterações não salvas. Se sair agora, vai perder o que foi mudado. Deseja sair mesmo?";

export function TemplateEditor({ initial }: TemplateEditorProps) {
  const router = useRouter();
  const initialLayout = useMemo(() => stripQrElements(initial?.layout ?? defaultLayout()), [initial?.layout]);
  const [name, setName] = useState(initial?.name ?? "Novo certificado");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [orientation, setOrientation] = useState(initial?.orientation ?? "landscape");
  const [width, setWidth] = useState(initial?.width ?? 1123);
  const [height, setHeight] = useState(initial?.height ?? 794);
  const [background, setBackground] = useState<string | null>(initial?.background ?? null);
  const [layout, setLayout] = useState<TemplateLayout>(() => initialLayout);
  const [selectedId, setSelectedId] = useState(initialLayout.elements[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const skipLeaveWarningRef = useRef(false);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const selected = layout.elements.find((element) => element.id === selectedId) ?? layout.elements[0];
  const scale = useMemo(() => Math.min(1, 900 / width, 680 / height), [height, width]);
  const previewSize = useMemo(
    () => ({ width: Math.ceil(width * scale), height: Math.ceil(height * scale) }),
    [height, scale, width],
  );
  const currentSnapshot = useMemo(
    () => buildSnapshot({ name, description, orientation, width, height, background, layout }),
    [background, description, height, layout, name, orientation, width],
  );
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
  const hasUnsavedChanges = currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (initial) return;

    const rawDraft = window.sessionStorage.getItem(templateImportDraftStorageKey);
    if (!rawDraft) return;

    let timeoutId: number | undefined;

    try {
      const draft = parseImportDraft(rawDraft);
      const draftLayout = stripQrElements(draft.layout);

      timeoutId = window.setTimeout(() => {
        setName(draft.name);
        setDescription(draft.description);
        setOrientation(draft.orientation);
        setWidth(draft.width);
        setHeight(draft.height);
        setBackground(draft.background);
        setLayout(draftLayout);
        setSelectedId(draftLayout.elements[0]?.id ?? "");
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

      if (!window.confirm(LEAVE_WARNING)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [hasUnsavedChanges]);

  function updateElement(patch: Partial<TemplateElement>) {
    if (!selected) return;
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === selected.id ? { ...element, ...patch } : element,
      ),
    }));
  }

  function addElement(type: EditableElementType) {
    addField(type);
  }

  function addField(type: EditableElementType, preset?: { key: string; label: string }) {
    const id = `${type}-${crypto.randomUUID()}`;
    const variableKey = preset?.key ?? "nova_variavel";
    const variableLabel = preset?.label ?? "Nova variável";
    const element: TemplateElement = {
      id,
      type,
      content: type === "variable" ? `{{${variableKey}}}` : type === "text" ? "Novo texto" : "",
      variableKey: type === "variable" ? variableKey : undefined,
      variableLabel: type === "variable" ? variableLabel : undefined,
      variableRequired: true,
      x: 120,
      y: 120,
      width: 280,
      height: 60,
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

  function applyPagePreset(nextOrientation: string) {
    const preset = PAGE_PRESETS[nextOrientation as keyof typeof PAGE_PRESETS];
    setOrientation(nextOrientation);
    if (preset) {
      setWidth(preset.width);
      setHeight(preset.height);
    }
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, element: TemplateElement) {
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

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
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

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
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

  async function applyBaseFile(file: File) {
    const dataUrl = await readFile(file);
    const fileType = file.type || guessFileType(file.name);
    const extracted = await extractDocumentPreview(file);
    const nextBase = uploadedBaseLayout({
      fileName: file.name,
      fileType,
      dataUrl,
      previewHtml: extracted.previewHtml,
      elements: extracted.elements,
    });

    if (fileType.startsWith("image/")) {
      setBackground(dataUrl);
      setLayout((current) => ({
        ...mergeImportedBase(current, nextBase),
        baseFileName: file.name,
        baseFileType: fileType,
        baseFileDataUrl: dataUrl,
        basePreviewHtml: extracted.previewHtml,
      }));
      return;
    }

    setBackground(null);
    setLayout((current) => ({
      ...mergeImportedBase(current, nextBase),
      baseFileName: file.name,
      baseFileType: fileType,
      baseFileDataUrl: dataUrl,
      basePreviewHtml: extracted.previewHtml,
    }));
  }

  async function save() {
    setSaving(true);
    const layoutToSave = stripQrElements(layout);
    const response = await fetch(initial ? `/api/templates/${initial.id}` : "/api/templates", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, width, height, orientation, background, layout: layoutToSave }),
    });
    setSaving(false);
    if (!response.ok) {
      alert("Não foi possível salvar o modelo.");
      return;
    }
    setSavedSnapshot(buildSnapshot({ name, description, orientation, width, height, background, layout: layoutToSave }));
    skipLeaveWarningRef.current = true;
    setLayout(layoutToSave);
    router.push("/modelos");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={() => addElement("text")} className="icon-button" title="Adicionar texto">
            <Type className="size-4" />
          </button>
          <button onClick={() => addElement("variable")} className="icon-button" title="Adicionar variável">
            <Plus className="size-4" />
          </button>
          <button onClick={() => addElement("variable")} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Plus className="size-4" />
            Campo
          </button>
          <label className="icon-button cursor-pointer" title="Enviar modelo como fundo">
            <ImagePlus className="size-4" />
            <input
              type="file"
              accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await applyBaseFile(file);
              }}
            />
          </label>
          {hasUnsavedChanges ? (
            <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              Alterações não salvas
            </span>
          ) : null}
          <button onClick={save} disabled={saving} className={`${hasUnsavedChanges ? "" : "ml-auto"} inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60`}>
            <Save className="size-4" />
            {saving ? "Salvando" : "Salvar"}
          </button>
        </div>

        <div className="overflow-auto rounded-lg bg-slate-200 p-3 sm:p-4">
          <div
            className="relative mx-auto"
            style={{
              width: previewSize.width,
              height: previewSize.height,
            }}
          >
          <div
            className="relative origin-top-left bg-white shadow-sm"
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
            {layout.baseFileType === "application/pdf" && layout.baseFileDataUrl ? (
              <embed
                src={layout.baseFileDataUrl}
                type="application/pdf"
                className="absolute inset-0 size-full"
              />
            ) : null}
            {layout.baseFileType?.includes("wordprocessingml") && layout.basePreviewHtml ? (
              <iframe
                title="Preview DOCX"
                srcDoc={dataUrlToHtmlDocument(layout.basePreviewHtml)}
                className="absolute inset-0 size-full border-0 bg-white"
              />
            ) : layout.baseFileType?.includes("wordprocessingml") && layout.baseFileName ? (
                <div className="absolute inset-0 grid place-items-center bg-slate-50 p-10 text-center">
                  <div>
                    <FileUp className="mx-auto size-12 text-teal-700" />
                    <p className="mt-4 text-lg font-bold text-slate-900">{layout.baseFileName}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      DOCX carregado. Não foi possível extrair preview; posicione as variáveis manualmente.
                    </p>
                  </div>
                </div>
            ) : null}
            <div className="pointer-events-none absolute inset-6 border-2 border-teal-700" />
            <div className="pointer-events-none absolute inset-10 border border-slate-400" />
            {layout.elements.map((element) => (
              <button
                key={element.id}
                onPointerDown={(event) => beginDrag(event, element)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={() => setSelectedId(element.id)}
                className={`absolute flex touch-none cursor-move items-center overflow-hidden border text-left ${selectedId === element.id ? "border-teal-700 ring-2 ring-teal-200" : "border-transparent hover:border-slate-300"}`}
                style={{
                  left: element.x,
                  top: element.y,
                  width: element.width,
                  height: element.height,
                  color: element.color,
                  fontFamily: element.fontFamily,
                  fontSize: element.fontSize,
                  fontWeight: element.bold ? 700 : 400,
                  justifyContent: element.align === "left" ? "flex-start" : element.align === "right" ? "flex-end" : "center",
                  textAlign: element.align,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.15,
                  wordBreak: "break-word",
                }}
              >
                {element.content}
              </button>
            ))}
          </div>
          </div>
        </div>
      </section>

      <aside className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-teal-300 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900 hover:bg-teal-100">
            <FileUp className="size-5" />
            <span>Enviar modelo pronto</span>
            <input
              type="file"
              accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await applyBaseFile(file);
              }}
            />
          </label>
          {layout.baseFileName ? (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
              Modelo: {layout.baseFileName}
            </div>
          ) : null}
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <p className="font-bold text-slate-800">Folha gerada: {PAGE_PRESETS[orientation as keyof typeof PAGE_PRESETS]?.label ?? "personalizada"}</p>
            <p className="mt-1">O certificado usa {width} x {height}px, equivalente ao A4 em {orientation === "portrait" ? "retrato" : "paisagem"}.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Placeholders rápidos</p>
            <div className="mt-3 flex flex-wrap gap-2">
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
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Nome</span>
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Descrição</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="field">
              <span>Largura</span>
              <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Altura</span>
              <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Orientação</span>
              <select value={orientation} onChange={(event) => applyPagePreset(event.target.value)}>
                <option value="landscape">Paisagem</option>
                <option value="portrait">Retrato</option>
              </select>
            </label>
          </div>
        </div>

        {selected ? (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Elemento selecionado</h2>
              <button
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
              <label className="field">
                  <span>Conteúdo</span>
                  <textarea value={selected.content} onChange={(event) => updateElement({ content: event.target.value })} />
              </label>
              {selected.type === "variable" ? (
                <div className="space-y-4 rounded-md border border-teal-100 bg-teal-50 p-3">
                  <label className="field">
                    <span>Label no formulário</span>
                    <input
                      value={selected.variableLabel ?? labelFromKey(selected.variableKey ?? "")}
                      placeholder="Ex: Nome do participante"
                      onChange={(event) => updateElement({ variableLabel: event.target.value })}
                    />
                  </label>
                  <label className="field">
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
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.variableRequired}
                      onChange={(event) => updateElement({ variableRequired: event.target.checked })}
                      className="size-4"
                    />
                    Campo obrigatório
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
                  <button key={String(align)} className="icon-button" onClick={() => updateElement({ align: align as "left" | "center" | "right" })}>
                    <Icon className="size-4" />
                  </button>
                ))}
                <button className="rounded-md border border-slate-300 px-3 text-sm font-bold" onClick={() => updateElement({ bold: !selected.bold })}>
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
    layout: stripQrElements(templateLayoutSchema.parse(parsed.layout ?? defaultLayout())),
  };
}

function positiveNumberOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mergeImportedBase(current: TemplateLayout, nextBase: TemplateLayout): TemplateLayout {
  const cleanedCurrent = stripQrElements(current);

  if (isDefaultStarterLayout(cleanedCurrent)) {
    return nextBase;
  }

  return {
    ...cleanedCurrent,
    elements: mergeImportedElements(cleanedCurrent.elements, nextBase.elements),
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
    layout: stripQrElements(layout),
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
