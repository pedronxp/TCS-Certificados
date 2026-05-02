export function getRequiredProductionSecret(name: string, fallback?: string) {
  const value = process.env[name]?.trim();

  if (value && (process.env.NODE_ENV !== "production" || value !== fallback)) return value;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}.`);
  }

  return fallback ?? "";
}

export function isPublicRegistrationEnabled() {
  return process.env.ALLOW_PUBLIC_REGISTRATION === "true";
}
