import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  adminClient ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}

export function getCertificateBucket() {
  return process.env.SUPABASE_CERTIFICATE_BUCKET || "certificados";
}

export async function uploadCertificateFile({
  buffer,
  filename,
  mimeType,
  verificationCode,
}: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  verificationCode: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const bucket = getCertificateBucket();
  const storagePath = `${verificationCode}/${filename}`;
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Falha ao enviar arquivo ao Supabase Storage: ${error.message}`);
  }

  return storagePath;
}

export async function downloadCertificateFile(storagePath: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.storage
    .from(getCertificateBucket())
    .download(storagePath);

  if (error) {
    throw new Error(`Falha ao baixar arquivo do Supabase Storage: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}
