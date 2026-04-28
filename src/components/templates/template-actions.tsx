"use client";

import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";

export function TemplateActions({ id }: { id: string }) {
  const router = useRouter();

  async function duplicate() {
    const response = await fetch(`/api/templates/${id}`, { method: "POST" });
    if (!response.ok) {
      alert("Não foi possível duplicar o modelo.");
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!confirm("Excluir este modelo? Certificados já emitidos podem impedir a exclusão.")) return;
    const response = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!response.ok) {
      alert("Não foi possível excluir o modelo.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-4 flex gap-2">
      <button onClick={duplicate} className="icon-button" title="Duplicar modelo">
        <Copy className="size-4" />
      </button>
      <button onClick={remove} className="icon-button" title="Excluir modelo">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
