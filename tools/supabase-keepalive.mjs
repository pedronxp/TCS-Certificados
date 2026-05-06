#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const envFiles = [".env.local", ".env"];
const dryRun = process.argv.includes("--dry-run");

await loadEnv();

const supabaseUrl = normalizeSupabaseUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
);
const serviceRoleKey =
  process.env.SUPABASE_KEEPALIVE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const rpcName = process.env.SUPABASE_KEEPALIVE_RPC || "run_system_keepalive";

if (!supabaseUrl) {
  fail("Defina NEXT_PUBLIC_SUPABASE_URL com a URL do projeto Supabase.");
}

if (!serviceRoleKey) {
  fail("Defina SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_KEEPALIVE_KEY.");
}

const endpoint = `${supabaseUrl}/rest/v1/rpc/${rpcName}`;

if (dryRun) {
  console.log(`Supabase keepalive dry run OK: ${endpoint}`);
  console.log(`Key: ${mask(serviceRoleKey)}`);
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  },
  body: "{}",
});

const responseText = await response.text();

if (!response.ok) {
  fail(
    `Supabase keepalive falhou: HTTP ${response.status} ${response.statusText}. ` +
      trimResponse(responseText),
  );
}

console.log(`Supabase keepalive OK em ${new Date().toISOString()}.`);

if (responseText.trim()) {
  console.log(`Resposta: ${trimResponse(responseText)}`);
}

async function loadEnv() {
  try {
    const { config } = await import("dotenv");

    for (const file of envFiles) {
      config({ path: file, quiet: true });
    }

    return;
  } catch {
    for (const file of envFiles) {
      loadEnvFile(file);
    }
  }
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;

  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]] !== undefined) continue;

    process.env[match[1]] = unquote(match[2].trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeSupabaseUrl(value) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  let url;

  try {
    url = new URL(trimmed);
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL precisa ser uma URL valida do Supabase.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    fail("NEXT_PUBLIC_SUPABASE_URL precisa usar http:// ou https://.");
  }

  return url.toString().replace(/\/+$/, "");
}

function trimResponse(value) {
  const trimmed = value.trim();
  if (!trimmed) return "Sem corpo de resposta.";

  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
}

function mask(value) {
  if (value.length <= 10) return "***";

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
