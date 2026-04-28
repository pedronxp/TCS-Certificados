"use client";

import { useRouter } from "next/navigation";

export function RevokeButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();

  async function revoke() {
    if (!confirm("Revogar este certificado? A página pública passará a mostrar o status revogado.")) return;
    const response = await fetch(`/api/certificates/${id}/revoke`, { method: "POST" });
    if (!response.ok) {
      alert("Não foi possível revogar o certificado.");
      return;
    }
    router.refresh();
  }

  return (
    <button
      disabled={disabled}
      onClick={revoke}
      className="rounded bg-red-50 px-2 py-1 font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Revogar
    </button>
  );
}
