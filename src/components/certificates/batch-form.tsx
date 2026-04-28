"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

export function BatchForm({
  templates,
}: {
  templates: Array<{ id: string; name: string }>;
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    const response = await fetch("/api/certificates/batch", { method: "POST", body: form });
    const result = await response.json();
    setLoading(false);
    setMessage(response.ok ? `${result.created} certificados gerados.` : result.error ?? "Falha na importação.");
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="field">
          <span>Modelo</span>
          <select name="templateId" required>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Planilha CSV ou XLSX</span>
          <input name="file" type="file" accept=".csv,.xlsx,.xls" required />
        </label>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        A planilha deve conter uma coluna para cada variável do modelo. A coluna nome será usada como titular quando existir.
      </p>
      <button disabled={loading} className="mt-6 inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
        <Upload className="size-4" />
        {loading ? "Importando" : "Importar e gerar"}
      </button>
      {message ? <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium">{message}</p> : null}
    </form>
  );
}
