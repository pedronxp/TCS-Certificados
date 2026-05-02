import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;
const bucketEnsurePromises = new Map<string, Promise<void>>();

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
  await ensureCertificateBucket(supabase, bucket);

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

async function ensureCertificateBucket(supabase: SupabaseClient, bucket: string) {
  const existingPromise = bucketEnsurePromises.get(bucket);
  if (existingPromise) return existingPromise;

  const ensurePromise = (async () => {
    const { error: getError } = await supabase.storage.getBucket(bucket);
    if (!getError) return;

    if (!isMissingBucketError(getError)) {
      throw new Error(`Falha ao verificar bucket do Supabase Storage "${bucket}": ${getError.message}`);
    }

    const { error: createError } = await supabase.storage.createBucket(bucket, {
      public: false,
    });

    if (createError && !isExistingBucketError(createError)) {
      throw new Error(`Falha ao criar bucket do Supabase Storage "${bucket}": ${createError.message}`);
    }
  })();

  bucketEnsurePromises.set(bucket, ensurePromise);

  try {
    await ensurePromise;
  } catch (error) {
    bucketEnsurePromises.delete(bucket);
    throw error;
  }
}

function isMissingBucketError(error: { message?: string; status?: number; statusCode?: number | string }) {
  return error.status === 404 || error.statusCode === 404 || error.statusCode === "404" || error.message === "Bucket not found";
}

function isExistingBucketError(error: { message?: string; status?: number; statusCode?: number | string }) {
  const message = error.message?.toLowerCase() ?? "";
  return error.status === 409 || error.statusCode === 409 || error.statusCode === "409" || message.includes("already exists");
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

export async function deleteCertificateFiles(storagePaths: string[]) {
  const supabase = getSupabaseAdmin();
  const paths = storagePaths.filter(Boolean);
  if (!supabase || !paths.length) return;

  const { error } = await supabase.storage
    .from(getCertificateBucket())
    .remove(paths);

  if (error) {
    throw new Error(`Falha ao remover arquivo do Supabase Storage: ${error.message}`);
  }
}
