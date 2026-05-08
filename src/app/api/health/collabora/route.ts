import { NextResponse } from "next/server";
import { checkCollaboraHealth } from "@/lib/collabora";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkCollaboraHealth();

  return NextResponse.json(health, {
    status: health.online ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
