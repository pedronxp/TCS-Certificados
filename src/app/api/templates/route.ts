import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin, requireUser } from "@/lib/auth";
import { defaultLayout, extractVariables, templateLayoutSchema } from "@/lib/certificate-layout";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireUser();
  const templates = await prisma.certificateTemplate.findMany({
    include: { variables: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const body = await request.json();
  const layout = templateLayoutSchema.parse(body.layout ?? defaultLayout());
  const variables = extractVariables(layout);

  const template = await prisma.certificateTemplate.create({
    data: {
      name: String(body.name ?? "Novo certificado"),
      description: body.description ? String(body.description) : null,
      width: Number(body.width ?? 1123),
      height: Number(body.height ?? 794),
      orientation: String(body.orientation ?? "landscape"),
      background: body.background ? String(body.background) : null,
      layout: layout as Prisma.InputJsonValue,
      createdById: user.id,
      variables: { create: variables },
    },
    include: { variables: true },
  });

  return NextResponse.json(template, { status: 201 });
}
