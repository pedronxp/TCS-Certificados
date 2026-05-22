"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/confirmation-dialog";

export function TemplateActions({ id }: { id: string }) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();

  async function remove() {
    const confirmed = await confirm({
      title: "Excluir modelo",
      message:
        "Tem certeza que deseja excluir este modelo?\n\nSe ele já foi usado em certificados ou lotes, o sistema pode bloquear a exclusão para preservar o histórico. Se a exclusão for permitida, o modelo deixa de aparecer na lista e não poderá mais ser usado para novas emissões.",
      confirmLabel: "Excluir modelo",
      tone: "danger",
    });
    if (!confirmed) return;

    const response = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      alert(result?.error ?? "Não foi possível excluir o modelo.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      {confirmationDialog}
      <button type="button" onClick={remove} className="icon-button" title="Excluir modelo" aria-label="Excluir modelo">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
