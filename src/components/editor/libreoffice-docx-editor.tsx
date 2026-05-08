"use client";

import { useEffect, useState } from "react";

type LibreOfficeDocxEditorProps = {
  editorUrl: string;
};

export function LibreOfficeDocxEditor({ editorUrl }: LibreOfficeDocxEditorProps) {
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        setError("");
        const response = await fetch("/api/health/collabora", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));

        if (!response.ok || body?.online !== true) {
          throw new Error(body?.url || "http://localhost:9980");
        }
      } catch (err) {
        if (cancelled) return;
        const url = err instanceof Error ? err.message : "http://localhost:9980";
        setError(
          `Nao foi possivel abrir o editor DOCX via LibreOffice Online. Verifique se o Collabora CODE esta rodando em ${url}.`,
        );
      }
    }

    void checkHealth();

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  if (error) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center rounded-lg border border-slate-200 bg-white p-8 text-center">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Editor DOCX indisponivel</h2>
          <p className="mt-2 max-w-lg text-sm text-slate-600">{error}</p>
          <button
            type="button"
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => setRetryKey((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={retryKey}
      title="Editor DOCX LibreOffice"
      src={editorUrl}
      className="h-[calc(100vh-9rem)] w-full overflow-hidden rounded-lg border border-slate-200 bg-white"
      allow="clipboard-read; clipboard-write; fullscreen"
    />
  );
}
