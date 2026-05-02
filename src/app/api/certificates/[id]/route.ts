import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { deleteCertificateIssue } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const data: Prisma.CertificateIssueUpdateInput = {};

  if (hasOwn(body, "deleteAt")) {
    const deleteAt = parseDeleteAt(body?.deleteAt);

    if (deleteAt === false) {
      return NextResponse.json(
        { error: "Informe uma data de exclusão válida." },
        { status: 400 },
      );
    }

    data.deleteAt = deleteAt;
  }

  if (hasOwn(body, "hidden")) {
    if (typeof body.hidden !== "boolean") {
      return NextResponse.json(
        { error: "Informe se o certificado deve ficar oculto." },
        { status: 400 },
      );
    }

    data.hiddenAt = body.hidden ? new Date() : null;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json(
      { error: "Informe uma alteração válida." },
      { status: 400 },
    );
  }

  const issue = await prisma.certificateIssue.update({
    where: { id },
    data,
    select: {
      id: true,
      deleteAt: true,
      hiddenAt: true,
    },
  }).catch(() => null);

  if (!issue) {
    return NextResponse.json(
      { error: "Certificado não encontrado." },
      { status: 404 },
    );
  }

  return NextResponse.json(issue);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await context.params;
  const deleted = await deleteCertificateIssue(id);

  if (!deleted) {
    return NextResponse.json(
      { error: "Certificado não encontrado." },
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

function parseDeleteAt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? false : date;
}

function hasOwn(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));
}
