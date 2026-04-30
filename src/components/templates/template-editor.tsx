"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlignCenter, AlignLeft, AlignRight, FileUp, ImagePlus, Plus, QrCode, Save, Trash2, Type } from "lucide-react";
import { defaultLayout, isDefaultStarterLayout, labelFromKey, normalizeVariableKey, uploadedBaseLayout, type TemplateElement, type TemplateLayout } from "@/lib/certificate-layout";
import { dataUrlToHtmlDocument, extractDocumentPreview } from "@/lib/document-extract.client";

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

export function TemplateEditor({ initial }: TemplateEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "Novo certificado");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [orientation, setOrientation] = useState(initial?.orientation ?? "landscape");
  const [width, setWidth] = useState(initial?.width ?? 1123);
  const [height, setHeight] = useState(initial?.height ?? 794);
  const [background, setBackground] = useState<string | null>(initial?.background ?? null);
  const [layout, setLayout] = useState<TemplateLayout>(initial?.layout ?? defaultLayout());
  const [selectedId, setSelectedId] = useState(layout.elements[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const selected = layout.elements.find((element) => element.id === selectedId) ?? layout.elements[0];
  const scale = useMemo(() => Math.min(1, 920 / width), [width]);

  function updateElement(patch: Partial<TemplateElement>) {
    if (!selected) return;
    setLayout((current) => ({
      elements: current.elements.map((element) =>
        element.id === selected.id ? { ...element, ...patch } : element,
      ),
    }));
  }

  function addElement(type: TemplateElement["type"]) {
    addField(type);
  }

  function addField(type: TemplateElement["type"], preset?: { key: string; label: string }) {
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
      width: type === "qr" ? 110 : 280,
      height: type === "qr" ? 110 : 60,
      fontSize: 28,
      fontFamily: "Arial",
      color: "#111827",
      align: "center",
      bold: false,
    };
    setLayout((current) => ({ elements: [...current.elements, element] }));
    setSelectedId(id);
  }

  function addPlaceholderPreset(key: string, label: string) {
    addField("variable", { key, label });
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

    if (file.type.startsWith("image/")) {
      setBackground(dataUrl);
      setLayout((current) => ({
        ...(isDefaultStarterLayout(current) ? nextBase : current),
        baseFileName: file.name,
        baseFileType: fileType,
        baseFileDataUrl: dataUrl,
        basePreviewHtml: extracted.previewHtml,
      }));
      return;
    }

    setBackground(null);
    setLayout((current) => ({
      ...(isDefaultStarterLayout(current) ? nextBase : current),
      baseFileName: file.name,
      baseFileType: fileType,
      baseFileDataUrl: dataUrl,
      basePreviewHtml: extracted.previewHtml,
    }));
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
      alert("Não foi possível salvar o modelo.");
      return;
    }
    router.push("/modelos");
    router.refresh();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
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
          <button onClick={() => addElement("qr")} className="icon-button" title="Adicionar QR Code">
            <QrCode className="size-4" />
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
          <button onClick={save} disabled={saving} className="ml-auto inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            <Save className="size-4" />
            {saving ? "Salvando" : "Salvar"}
          </button>
        </div>

        <div className="overflow-auto rounded-lg bg-slate-200 p-4">
          <div
            className="relative origin-top-left bg-white shadow-sm"
            style={{
              width,
              height,
              transform: `scale(${scale})`,
              marginBottom: height * scale - height,
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
                onClick={() => setSelectedId(element.id)}
                className={`absolute flex items-center overflow-hidden border text-left ${selectedId === element.id ? "border-teal-700 ring-2 ring-teal-200" : "border-transparent hover:border-slate-300"}`}
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
                }}
              >
                {element.type === "qr" ? <QrCode className="mx-auto size-16" /> : element.content}
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-4">
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
              <select value={orientation} onChange={(event) => setOrientation(event.target.value)}>
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
                  setLayout((current) => ({ elements: current.elements.filter((item) => item.id !== selected.id) }));
                  setSelectedId("");
                }}
                title="Excluir elemento"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              {selected.type !== "qr" ? (
                <label className="field">
                  <span>Conteúdo</span>
                  <textarea value={selected.content} onChange={(event) => updateElement({ content: event.target.value })} />
                </label>
              ) : null}
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
