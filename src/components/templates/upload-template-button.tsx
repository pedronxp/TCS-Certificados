"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { uploadedBaseLayout } from "@/lib/certificate-layout";
import { extractDocumentPreview } from "@/lib/document-extract.client";
import { templateImportDraftStorageKey, type TemplateImportDraft } from "@/lib/template-import-draft";

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
      const pagePreset = extracted.page ?? { width: 1123, height: 794, orientation: "landscape" };
      const isEditableDocx = fileType.includes("wordprocessingml") && extracted.editable && extracted.elements.length > 0;
      const layout = uploadedBaseLayout({
        fileName: file.name,
        fileType,
        dataUrl,
        previewHtml: extracted.previewHtml,
        renderDataUrl: isEditableDocx ? undefined : extracted.renderDataUrl,
        renderFileType: isEditableDocx ? undefined : extracted.renderFileType,
        renderEngine: isEditableDocx ? undefined : extracted.renderEngine,
        imageDataUrl: isEditableDocx ? undefined : extracted.imageDataUrl,
        imageEngine: isEditableDocx ? undefined : extracted.imageEngine,
        elements: extracted.elements,
        pageBorder: extracted.page?.border,
        baseDocumentMode: isEditableDocx ? "editable" : "native",
      });
      const draft: TemplateImportDraft = {
        name: file.name.replace(/\.[^.]+$/, ""),
        description: `Modelo enviado a partir de ${file.name}`,
        width: pagePreset.width,
        height: pagePreset.height,
        orientation: pagePreset.orientation,
        background: fileType.startsWith("image/") ? dataUrl : null,
        layout,
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
        accept=".pdf,.docx,.png,.jpg,.jpeg,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
  return "application/octet-stream";
}
