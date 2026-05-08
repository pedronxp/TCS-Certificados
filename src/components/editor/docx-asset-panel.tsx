"use client";

/* eslint-disable @next/next/no-img-element */

import { useRef, useState } from "react";
import { FilePenLine, ImageIcon, RefreshCw } from "lucide-react";
import { type TemplateBaseAsset, type TemplateLayoutPage } from "@/lib/certificate-layout";
import { isPdfDataUrl } from "@/lib/pdf-preview.client";
import { useEditorStore } from "@/stores/editor-store";

export function DocxAssetPanel() {
  const baseAssets = useEditorStore((s) => s.baseAssets);
  const baseDocumentMode = useEditorStore((s) => s.baseDocumentMode);
  const baseFileDataUrl = useEditorStore((s) => s.baseFileDataUrl);
  const baseFileName = useEditorStore((s) => s.baseFileName);
  const baseFileType = useEditorStore((s) => s.baseFileType);
  const templateId = useEditorStore((s) => s.id);
  const setDocument = useEditorStore((s) => s.setDocument);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  if (baseDocumentMode !== "native" || !baseFileDataUrl) {
    return (
      <div className="te-panel">
        <div className="te-panel-title">Imagens do DOCX</div>
        <p className="te-muted-copy">Este painel aparece para modelos DOCX em modo fiel.</p>
      </div>
    );
  }

  if (baseAssets.length === 0) {
    return (
      <div className="te-panel">
        <div className="te-panel-title">Imagens do DOCX</div>
        <p className="te-muted-copy">Nenhuma imagem interna foi encontrada neste arquivo.</p>
      </div>
    );
  }

  async function handleReplace(asset: TemplateBaseAsset, file: File) {
    setError("");
    setRefreshing(true);

    try {
      const replacementDataUrl = await convertImageFile(file, asset.contentType);
      const nextAssets = baseAssets.map((item) =>
        item.path === asset.path ? { ...item, replacementDataUrl } : item,
      );

      setDocument({ baseAssets: nextAssets });
      await refreshDocxPreview(nextAssets);
    } catch (err) {
      console.error("Falha ao trocar imagem do DOCX:", err);
      setError("Nao foi possivel trocar esta imagem.");
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshDocxPreview(nextAssets: TemplateBaseAsset[]) {
    if (!baseFileDataUrl) return;

    const formData = new FormData();
    formData.append(
      "file",
      dataUrlToFile(
        baseFileDataUrl,
        baseFileName ?? "modelo.docx",
        baseFileType ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    );
    formData.append("assets", JSON.stringify(nextAssets));

    const response = await fetch("/api/templates/docx-preview", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error(`Erro ${response.status}`);
    const preview = await response.json() as {
      renderDataUrl?: string;
      renderFileType?: string;
      renderEngine?: string;
      imageDataUrl?: string;
      imageEngine?: string;
      page?: TemplateLayoutPage;
      pages?: TemplateLayoutPage[];
      assets?: TemplateBaseAsset[];
    };

    let pages = preview.pages ?? [];

    if (preview.renderDataUrl && isPdfDataUrl(preview.renderDataUrl)) {
      const { renderPdfPagesFromDataUrl } = await import("@/lib/pdf-preview.client");
      const renderedPages = await renderPdfPagesFromDataUrl(preview.renderDataUrl);
      pages = mergeRenderedPages(pages, renderedPages);
    }

    setDocument({
      basePages: pages,
      baseRenderDataUrl: preview.renderDataUrl ?? null,
      baseRenderFileType: preview.renderFileType ?? null,
      baseRenderEngine: preview.renderEngine ?? null,
      baseImageDataUrl: pages[0]?.imageDataUrl ?? preview.imageDataUrl ?? null,
      baseImageEngine: pages.some((page) => page.imageDataUrl) ? "pdfjs-gotenberg" : preview.imageEngine ?? null,
      baseAssets: mergeReplacementState(preview.assets ?? nextAssets, nextAssets),
    });
  }

  return (
    <div className="te-panel">
      <div className="te-panel-title">Imagens do DOCX</div>
      <p className="te-muted-copy">
        Troque imagens do arquivo mantendo o layout fiel do DOCX.
      </p>
      {templateId && (
        <button
          className="te-btn"
          style={{ justifyContent: "flex-start", width: "100%", marginBottom: "0.65rem" }}
          onClick={() => {
            window.location.href = `/modelos/${templateId}/office`;
          }}
        >
          <FilePenLine />
          Editar layout no LibreOffice
        </button>
      )}

      {error && <p className="te-error-copy">{error}</p>}

      <div className="te-docx-assets">
        {baseAssets.map((asset) => (
          <div key={asset.path} className="te-docx-asset">
            <img src={asset.replacementDataUrl || asset.dataUrl} alt="" />
            <div>
              <strong>{asset.name}</strong>
              <small>{asset.width ?? "?"} x {asset.height ?? "?"}</small>
            </div>
            <button
              className="te-btn"
              disabled={refreshing}
              onClick={() => inputRefs.current[asset.path]?.click()}
            >
              {refreshing ? <RefreshCw /> : <ImageIcon />}
              Trocar
            </button>
            <input
              ref={(element) => {
                inputRefs.current[asset.path] = element;
              }}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await handleReplace(asset, file);
                event.target.value = "";
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
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

function mergeReplacementState(
  assets: TemplateBaseAsset[],
  replacements: TemplateBaseAsset[],
) {
  const replacementMap = new Map(replacements.map((asset) => [asset.path, asset.replacementDataUrl]));

  return assets.map((asset) => ({
    ...asset,
    replacementDataUrl: replacementMap.get(asset.path) || asset.replacementDataUrl,
  }));
}

async function convertImageFile(file: File, targetMimeType: string) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas indisponivel");

  if (targetMimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(image, 0, 0);
  return canvas.toDataURL(targetMimeType === "image/png" ? "image/png" : "image/jpeg", 0.92);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, fileType: string) {
  const base64 = dataUrl.split(",").at(-1) ?? "";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new File([bytes], fileName, { type: fileType });
}
