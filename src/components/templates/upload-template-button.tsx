"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { labelFromKey, uploadedBaseLayout } from "@/lib/certificate-layout";
import { extractDocumentPreview } from "@/lib/document-extract.client";
import { templateImportDraftStorageKey, type TemplateImportDraft } from "@/lib/template-import-draft";
import { getTemplateVariableDefaultRequired } from "@/lib/template-variable-fields";

export function UploadTemplateButton() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  async function readFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const dataUrl = await readFile(file);
      const fileType = file.type || guessFileType(file.name);
      const extracted = await extractDocumentPreview(file);
      if (extracted.converterOffline) {
        alert("Aviso: O servico de conversao de documentos (Gotenberg/LibreOffice) parece estar indisponivel. Um preview de fallback local sera utilizado, mas pode apresentar diferencas visuais. Configure GOTENBERG_URL no servidor.");
      }
      const pagePreset = extracted.page ?? { width: 1123, height: 794, orientation: "landscape" };
      const isDocxFile = fileType.includes("wordprocessingml");
      const isPptxFile = fileType.includes("presentationml");
      const layout = uploadedBaseLayout({
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
        assets: extracted.assets,
        baseDocumentMode: isDocxFile || isPptxFile ? "native" : undefined,
      });
      const draft: TemplateImportDraft = {
        name: file.name.replace(/\.[^.]+$/, ""),
        description: `Modelo enviado a partir de ${file.name}`,
        width: pagePreset.width,
        height: pagePreset.height,
        orientation: pagePreset.orientation,
        background: fileType.startsWith("image/") ? dataUrl : null,
        layout: extracted.variables?.length
          ? {
              ...layout,
              variableDefinitions: extracted.variables.map((key) => ({
                key,
                label: labelFromKey(key),
                required: getTemplateVariableDefaultRequired({ key, label: labelFromKey(key) }),
              })),
            }
          : layout,
      };

      window.sessionStorage.setItem(templateImportDraftStorageKey, JSON.stringify(draft));
      router.push("/modelos/novo");
    } catch {
      alert("Nao foi possivel importar o modelo para edicao.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-teal-700 bg-white px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50">
      <FileUp className="size-4" />
      {uploading ? "Importando" : "Importar modelo"}
      <input
        type="file"
        accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        className="hidden"
        disabled={uploading}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) await upload(file);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function guessFileType(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/octet-stream";
}
