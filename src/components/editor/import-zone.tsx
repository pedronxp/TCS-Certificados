/**
 * ImportZone — Drag & drop zone for importing DOCX/PDF/Image files
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { useEditorStore } from "@/stores/editor-store";

const ACCEPTED_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

const ACCEPTED_EXTENSIONS = ".docx,.pdf,.png,.jpg,.jpeg,.webp";

export function ImportZone() {
  const setDocument = useEditorStore((s) => s.setDocument);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

      if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        /* Image → set as background */
        const reader = new FileReader();
        reader.onload = () => {
          pushHistory();
          setDocument({
            background: reader.result as string,
            baseFileName: file.name,
            baseFileType: "image",
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      if (ext === "docx" || ext === "pdf") {
        /* DOCX/PDF → delegate to document extraction (will be expanded) */
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = reader.result as string;
          pushHistory();

          // For now, set base file info — full extraction will use the document-service
          setDocument({
            baseFileName: file.name,
            baseFileType: ext,
          });

          // Import the existing client-side extraction dynamically
          try {
            const { extractDocumentPreviewFromDataUrl } = await import("@/lib/document-extract.client");
            const preview = await extractDocumentPreviewFromDataUrl({ dataUrl, fileType: ext });
            if (preview?.converterOffline && !window.sessionStorage.getItem("tcs-gotenberg-alerted")) {
              alert("Aviso: O servico de conversao de documentos (Gotenberg/LibreOffice) parece estar indisponivel. Um preview de fallback local sera utilizado, mas pode apresentar diferencas visuais. Configure GOTENBERG_URL no servidor.");
              window.sessionStorage.setItem("tcs-gotenberg-alerted", "true");
            }
            if (preview?.pages) {
              setDocument({
                basePages: preview.pages,
              });
            }
          } catch (err) {
            console.error("Document extraction failed:", err);
          }
        };
        reader.readAsDataURL(file);
        return;
      }

      alert("Formato não suportado. Use DOCX, PDF ou imagem (PNG/JPG/WebP).");
    },
    [setDocument, pushHistory],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile],
  );

  return (
    <div className="te-panel">
      <div className="te-panel-title">Arquivo base</div>
      <div
        className="te-import-zone"
        style={isDragOver ? { borderColor: "var(--brand-600)", background: "var(--brand-50)" } : undefined}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <FileUp />
        <span>Arraste ou clique para importar</span>
        <small style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
          DOCX, PDF, PNG, JPG
        </small>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileInput}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
