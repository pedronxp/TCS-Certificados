/**
 * Variable Parser — Extraction & validation of {{variables}}
 *
 * Pure functions, no side effects. Shared between client and server.
 */

import { normalizeVariableKey } from "@/lib/certificate-layout";

const VARIABLE_REGEX = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Extract all unique variable keys from text, with normalized keys.
 */
export function parseVariableKeys(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const raw = match[1].trim();
    const key = normalizeVariableKey(raw);
    if (key) seen.add(key);
  }
  return [...seen];
}

/**
 * Validate a variable key. Returns an error message or null if valid.
 */
export function validateVariableKey(key: string): string | null {
  if (!key) return "A chave não pode ser vazia.";
  const normalized = normalizeVariableKey(key);
  if (!normalized) return "A chave contém apenas caracteres inválidos.";
  if (normalized.length > 64) return "A chave é muito longa (máx. 64 caracteres).";
  if (/^\d/.test(normalized)) return "A chave não pode começar com número.";
  return null;
}

/**
 * Replace variable placeholders with actual values.
 */
export function replaceVariables(text: string, values: Record<string, string>): string {
  return text.replace(VARIABLE_REGEX, (_, rawKey) => {
    const key = normalizeVariableKey(String(rawKey).trim());
    return values[key] ?? `{{${rawKey}}}`;
  });
}

/**
 * Highlight variable syntax in text for display purposes.
 * Returns an array of segments: { text, isVariable, key? }
 */
export interface TextSegment {
  text: string;
  isVariable: boolean;
  key?: string;
}

export function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const matchStart = match.index!;
    if (matchStart > lastIndex) {
      segments.push({ text: text.slice(lastIndex, matchStart), isVariable: false });
    }
    segments.push({
      text: match[0],
      isVariable: true,
      key: normalizeVariableKey(match[1].trim()),
    });
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isVariable: false });
  }

  return segments;
}
