"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TemplateVariable } from "@prisma/client";
import { BadgeCheck } from "lucide-react";

export function IssueForm({
  templates,
  initialTemplateId,
}: {
  templates: Array<{
    id: string;
    name: string;
    variables: TemplateVariable[];
  }>;
  initialTemplateId?: string;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(
    templates.some((template) => template.id === initialTemplateId)
      ? initialTemplateId ?? templates[0]?.id ?? ""
      : templates[0]?.id ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/certificates/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, values }),
    });
    setLoading(false);
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      alert(result?.error ?? "Não foi possível emitir o certificado.");
      return;
    }
    router.push("/certificados/historico");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5">
      <label className="field max-w-xl">
        <span>Modelo</span>
        <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {selectedTemplate?.variables.map((variable) => (
          <label key={variable.id} className="field">
            <span>{variable.label}</span>
            <input
              required={variable.required}
              value={values[variable.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [variable.key]: event.target.value }))}
              placeholder={`{{${variable.key}}}`}
            />
          </label>
        ))}
      </div>

      <button disabled={!templateId || loading} className="mt-6 inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
        <BadgeCheck className="size-4" />
        {loading ? "Gerando" : "Gerar PDF e DOCX"}
      </button>
    </form>
  );
}
