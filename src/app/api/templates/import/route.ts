import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createTemplateFromImportedFile,
  normalizeImportVariableDefinitions,
  normalizeImportVariableLabels,
} from "@/lib/template-import-service";
import { validateTemplateImportFile } from "@/lib/upload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireAdmin();
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo do modelo nao enviado." }, { status: 400 });
  }

  const fileError = validateTemplateImportFile(file);
  if (fileError) {
    return NextResponse.json({ error: fileError }, { status: 400 });
  }

  try {
    const variableDefinitions = [
      ...parseVariableDefinitions(formData.get("variableDefinitions")),
      ...parseVariableLabels(formData.get("variableLabels")),
    ];

    const template = await createTemplateFromImportedFile({
      fileName: file.name,
      fileType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
      createdById: user.id,
      name: stringField(formData.get("name")),
      description: stringField(formData.get("description")),
      width: numberField(formData.get("width")),
      height: numberField(formData.get("height")),
      orientation: orientationField(formData.get("orientation")),
      variableDefinitions,
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "JSON invalido nos campos de variaveis." },
        { status: 400 },
      );
    }

    console.error("Falha ao importar modelo", error);
    return NextResponse.json(
      { error: "Nao foi possivel importar o modelo." },
      { status: 500 },
    );
  }
}

function parseVariableDefinitions(value: FormDataEntryValue | null) {
  return normalizeImportVariableDefinitions(parseJsonField(value));
}

function parseVariableLabels(value: FormDataEntryValue | null) {
  return normalizeImportVariableLabels(parseJsonField(value));
}

function parseJsonField(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return JSON.parse(value);
}

function stringField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

function numberField(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function orientationField(value: FormDataEntryValue | null) {
  return value === "portrait" || value === "landscape" ? value : undefined;
}
