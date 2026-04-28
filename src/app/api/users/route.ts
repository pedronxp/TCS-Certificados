import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  await requireAdmin();
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "OPERADOR") === "ADMIN" ? "ADMIN" : "OPERADOR";

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hash(password, 12),
      role,
    },
  });

  return NextResponse.redirect(new URL("/usuarios", request.url));
}
