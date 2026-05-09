import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { resetCertificateDatabase } from "@/lib/certificate-service";

export async function POST() {
  await requireAdmin();
  const result = await resetCertificateDatabase();

  return NextResponse.json(result);
}
