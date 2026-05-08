/**
 * Template Validator — Zod schemas for API validation
 *
 * Server-side validation for template create/update payloads.
 * Uses the existing layout schema from certificate-layout.ts.
 */

import { z } from "zod";
import { templateLayoutSchema } from "@/lib/certificate-layout";

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "O nome do modelo é obrigatório.")
    .max(200, "O nome não pode ter mais de 200 caracteres.")
    .default("Novo certificado"),
  description: z
    .string()
    .max(1000, "A descrição não pode ter mais de 1000 caracteres.")
    .nullable()
    .optional(),
  width: z.number().int().min(200).max(5000).default(1123),
  height: z.number().int().min(200).max(5000).default(794),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  background: z.string().nullable().optional(),
  layout: templateLayoutSchema,
});

export const updateTemplateSchema = createTemplateSchema;

export type CreateTemplatePayload = z.infer<typeof createTemplateSchema>;
export type UpdateTemplatePayload = z.infer<typeof updateTemplateSchema>;

/**
 * Parse and validate a create payload. Returns parsed data or throws ZodError.
 */
export function parseCreatePayload(body: unknown): CreateTemplatePayload {
  return createTemplateSchema.parse(body);
}

/**
 * Parse and validate an update payload. Returns parsed data or throws ZodError.
 */
export function parseUpdatePayload(body: unknown): UpdateTemplatePayload {
  return updateTemplateSchema.parse(body);
}

/**
 * Format Zod errors into a user-friendly object.
 */
export function formatZodErrors(error: z.ZodError) {
  return {
    error: "Dados inválidos.",
    code: "VALIDATION_ERROR",
    details: error.issues.map((e) => ({
      path: e.path.map(String).join("."),
      message: e.message,
    })),
  };
}
