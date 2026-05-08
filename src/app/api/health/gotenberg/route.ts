import { NextResponse } from "next/server";
import { checkGotenbergHealth } from "@/lib/gotenberg";

/**
 * GET /api/health/gotenberg
 *
 * Health-check do serviço Gotenberg.
 * Usado pelo Cron-job.org para manter o Render acordado
 * e pelo frontend para verificar disponibilidade.
 */
export async function GET() {
  const health = await checkGotenbergHealth();

  return NextResponse.json(health, {
    status: health.online ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
