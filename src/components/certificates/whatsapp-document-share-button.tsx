"use client";

import { useState } from "react";
import { LoaderCircle, MessageCircle } from "lucide-react";

type WhatsappValidationMessageButtonProps = {
  message: string;
  phoneNumber?: string | null;
  large?: boolean;
};

export function WhatsappValidationMessageButton({
  message,
  phoneNumber,
  large = false,
}: WhatsappValidationMessageButtonProps) {
  const [status, setStatus] = useState("");
  const [sharing, setSharing] = useState(false);

  function openValidationMessage() {
    if (sharing) return;

    setSharing(true);
    setStatus("");
    const fallbackWindow = window.open("about:blank", "_blank");
    if (fallbackWindow) fallbackWindow.opener = null;

    try {
      openWhatsapp(message, fallbackWindow, phoneNumber);
      setStatus("WhatsApp aberto com a mensagem de validação.");
    } catch (error) {
      fallbackWindow?.close();
      setStatus(error instanceof Error ? error.message : "Nao foi possivel abrir o WhatsApp agora.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <button
        type="button"
        onClick={openValidationMessage}
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
        {sharing ? "Preparando envio" : "Enviar validação no WhatsApp"}
      </button>
      {status ? (
        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", lineHeight: 1.35 }}>
          {status}
        </span>
      ) : null}
    </div>
  );
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
