"use client";

import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/confirmation-dialog";

export function RevokeButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const { confirm, confirmationDialog } = useConfirmDialog();

  async function revoke() {
    const confirmed = await confirm({
      title: "Revogar certificado",
      message: "A página pública continuará abrindo, mas passará a mostrar o status revogado.",
      confirmLabel: "Revogar",
      tone: "danger",
    });
    if (!confirmed) return;

    const response = await fetch(`/api/certificates/${id}/revoke`, { method: "POST" });
    if (!response.ok) {
      alert("Não foi possível revogar o certificado.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {confirmationDialog}
      <button
        disabled={disabled}
        onClick={revoke}
        className="rounded bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Revogar
      </button>
    </>
  );
}
