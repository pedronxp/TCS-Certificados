import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createUserSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100).trim(),
  email: z.string().email("E-mail invalido.").toLowerCase().trim(),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres.").max(72),
  role: z.enum(["ADMIN", "OPERADOR"]).default("OPERADOR"),
});

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
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role") === "ADMIN" ? "ADMIN" : "OPERADOR",
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Dados invalidos.";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  const { name, email, password, role } = parsed.data;

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await hash(password, 12),
        role,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Este e-mail ja esta em uso." }, { status: 409 });
    }

    throw error;
  }

  return NextResponse.redirect(new URL("/usuarios", request.url));
}
