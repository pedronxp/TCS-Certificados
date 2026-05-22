"use client";

import { useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";

type WhatsappDocumentShareButtonProps = {
  fileUrl: string;
  fileName: string;
  message: string;
  phoneNumber?: string | null;
  large?: boolean;
};

type NavigatorWithFileShare = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

export function WhatsappDocumentShareButton({
  fileUrl,
  fileName,
  message,
  phoneNumber,
  large = false,
}: WhatsappDocumentShareButtonProps) {
  const [status, setStatus] = useState("");
  const [sharing, setSharing] = useState(false);

  async function shareDocument() {
    if (sharing) return;

    setSharing(true);
    setStatus("");
    const fallbackWindow = window.open("about:blank", "_blank");
    if (fallbackWindow) fallbackWindow.opener = null;

    try {
      const response = await fetch(fileUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Nao foi possivel baixar o PDF para compartilhar.");
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, {
        type: blob.type || "application/pdf",
      });
      const shareData: ShareData = {
        title: "Certificado",
        text: message,
        files: [file],
      };
      const navigatorWithShare = navigator as NavigatorWithFileShare;
      const canShareFiles =
        typeof navigatorWithShare.canShare === "function" &&
        navigatorWithShare.canShare(shareData);

      if (navigatorWithShare.share && canShareFiles) {
        try {
          await navigatorWithShare.share(shareData);
          fallbackWindow?.close();
          setStatus("Arquivo enviado para compartilhamento.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            fallbackWindow?.close();
            setStatus("Compartilhamento cancelado.");
            return;
          }
        }
      }

      downloadFile(blob, fileName);
      openWhatsapp(
        `${message}\n\nO PDF foi baixado neste dispositivo. Anexe o arquivo "${fileName}" nesta conversa do WhatsApp.`,
        fallbackWindow,
        phoneNumber,
      );
      setStatus("PDF baixado. Anexe o arquivo na conversa do WhatsApp.");
    } catch (error) {
      fallbackWindow?.close();
      setStatus(error instanceof Error ? error.message : "Nao foi possivel compartilhar agora.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <button
        type="button"
        onClick={shareDocument}
        className="btn btn-ghost"
        style={{
          minHeight: large ? "4.25rem" : undefined,
          justifyContent: "center",
          gap: "0.5rem",
          borderColor: "color-mix(in oklch, #16a34a 45%, var(--border-muted))",
          color: "#15803d",
        }}
      >
        {sharing ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <MessageCircle style={{ width: 18, height: 18 }} />
        )}
        {sharing ? "Preparando PDF" : "Enviar PDF no WhatsApp"}
      </button>
      {status ? (
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.35 }}>
          {status}
        </span>
      ) : null}
    </div>
  );
}

function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openWhatsapp(message: string, targetWindow: Window | null, phoneNumber?: string | null) {
  const phone = normalizeWhatsappPhone(phoneNumber);
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (targetWindow) {
    targetWindow.location.href = whatsappUrl;
  } else {
    window.location.href = whatsappUrl;
  }
}

function normalizeWhatsappPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
