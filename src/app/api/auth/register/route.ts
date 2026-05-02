import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { isPublicRegistrationEnabled } from "@/lib/env";

const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres.")
    .max(100, "Nome muito longo.")
    .trim(),
  email: z
    .string()
    .email("Formato de e-mail inválido.")
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(72, "A senha é muito longa."),
});

export async function POST(request: Request) {
  try {
    if (!isPublicRegistrationEnabled()) {
      return NextResponse.json(
        { error: "Cadastro publico desativado. Solicite acesso ao administrador." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      return NextResponse.json({ error: message }, { status: 422 });
    }

    const { name, email, password } = parsed.data;

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Este e-mail já está em uso. Tente fazer login." },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "OPERADOR",
      },
      select: { id: true, name: true, email: true, role: true },
    });

    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Register failed", error);
    return NextResponse.json(
      { error: "Não foi possível criar a conta agora. Tente novamente." },
      { status: 503 },
    );
  }
}
