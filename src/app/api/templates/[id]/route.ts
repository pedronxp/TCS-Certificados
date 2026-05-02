import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin, requireUser } from "@/lib/auth";
import { extractVariables, templateLayoutSchema } from "@/lib/certificate-layout";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await context.params;
  const template = await prisma.certificateTemplate.findUnique({
    where: { id },
    include: { variables: true },
  });
  if (!template) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;
  const body = await request.json();
  const layout = templateLayoutSchema.parse(body.layout);
  const variables = extractVariables(layout);

  const template = await prisma.certificateTemplate.update({
    where: { id },
    data: {
      name: String(body.name ?? "Certificado"),
      description: body.description ? String(body.description) : null,
      width: Number(body.width ?? 1123),
      height: Number(body.height ?? 794),
      orientation: String(body.orientation ?? "landscape"),
      background: body.background ? String(body.background) : null,
      layout: layout as Prisma.InputJsonValue,
      variables: {
        deleteMany: {},
        create: variables,
      },
    },
    include: { variables: true },
  });

  return NextResponse.json(template);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin();
  const { id } = await context.params;
  const source = await prisma.certificateTemplate.findUnique({
    where: { id },
    include: { variables: true },
  });

  if (!source) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });

  const copy = await prisma.certificateTemplate.create({
    data: {
      name: `${source.name} (cópia)`,
      description: source.description,
      width: source.width,
      height: source.height,
      orientation: source.orientation,
      background: source.background,
      layout: source.layout as Prisma.InputJsonValue,
      createdById: user.id,
      variables: {
        create: source.variables.map((variable) => ({
          key: variable.key,
          label: variable.label,
          required: variable.required,
        })),
      },
    },
  });

  return NextResponse.json(copy, { status: 201 });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;

  const template = await prisma.certificateTemplate.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          issues: true,
        },
      },
    },
  });

  if (!template) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });

  if (template._count.issues > 0) {
    return NextResponse.json(
      {
        error: "Este modelo não pode ser excluído porque possui emissões vinculadas.",
      },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction([
      prisma.certificateBatch.deleteMany({
        where: {
          templateId: id,
          issues: { none: {} },
        },
      }),
      prisma.certificateTemplate.delete({ where: { id } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        {
          error: "Este modelo não pode ser excluído porque possui emissões vinculadas.",
        },
        { status: 409 },
      );
    }

    throw error;
  }

  return NextResponse.json({ ok: true });
}
