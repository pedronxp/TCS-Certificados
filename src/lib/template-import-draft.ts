import type { TemplateLayout } from "@/lib/certificate-layout";

export const templateImportDraftStorageKey = "tcs-certificado:template-import-draft";

export type TemplateImportDraft = {
  name: string;
  description: string;
  width: number;
  height: number;
  orientation: string;
  background: string | null;
  layout: TemplateLayout;
};
