"use client";

import { useCallback, useState } from "react";

type ConfirmTone = "default" | "danger";

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmState = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({
        cancelLabel: "Cancelar",
        confirmLabel: "Confirmar",
        tone: "default",
        ...options,
        resolve,
      });
    });
  }, []);

  function close(confirmed: boolean) {
    state?.resolve(confirmed);
    setState(null);
  }

  const confirmationDialog = state ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--surface-1)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          padding: "1.5rem",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          animation: "fadeSlideUp 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        <h2
          id="confirmation-dialog-title"
          style={{
            fontSize: "1.0625rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "0.625rem",
          }}
        >
          {state.title}
        </h2>
        <p
          style={{
            fontSize: "0.875rem",
            lineHeight: 1.65,
            color: "var(--text-secondary)",
          }}
        >
          {state.message}
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: "0.625rem",
            marginTop: "1.5rem",
          }}
        >
          {/* Cancel */}
          <button
            type="button"
            onClick={() => close(false)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 38,
              padding: "0 1.125rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-muted)",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            {state.cancelLabel}
          </button>

          {/* Confirm */}
          <button
            type="button"
            onClick={() => close(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 38,
              padding: "0 1.125rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
              border: "none",
              transition: "all 150ms",
              background:
                state.tone === "danger"
                  ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                  : "var(--brand-600)",
              boxShadow:
                state.tone === "danger"
                  ? "0 4px 14px rgba(220,38,38,0.3)"
                  : "0 4px 14px rgba(37,99,235,0.3)",
            }}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmationDialog };
}
