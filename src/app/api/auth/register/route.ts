import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Cadastro publico desativado. Solicite acesso ao administrador." },
    { status: 403 },
  );
}
