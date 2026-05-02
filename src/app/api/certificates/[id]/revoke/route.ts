import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;
  const issue = await prisma.certificateIssue.update({
    where: { id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokeReason: "Revogado pelo painel administrativo.",
    },
  });

  return NextResponse.json(issue);
}
