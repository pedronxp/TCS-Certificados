export type BatchResultMessageInput = {
  total?: number;
  created?: number;
  status?: "running" | "completed" | "failed";
  errors?: string[];
};

export function buildBatchResultMessage(result: BatchResultMessageInput, fallbackTotal: number) {
  const total = result.total ?? fallbackTotal;
  const created = result.created ?? 0;
  const errors = result.errors?.length ?? 0;

  if (result.status === "completed") {
    if (errors > 0) {
      return `Lote finalizado: ${created}/${total} gerados e ${errors} com erro.`;
    }

    return `Lote finalizado: ${created}/${total} certificados gerados.`;
  }

  if (result.status === "failed") {
    return result.errors?.[0] ?? "Lote falhou.";
  }

  return `Lote iniciado com ${total} certificados. Mantenha esta aba aberta até a conclusão.`;
}
