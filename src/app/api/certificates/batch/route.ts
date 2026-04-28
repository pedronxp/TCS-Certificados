import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth";
import { issueCertificate } from "@/lib/certificate-service";

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const templateId = String(formData.get("templateId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie uma planilha." }, { status: 400 });
  }

  const rows = await parseRows(file);
  if (!rows.length) {
    return NextResponse.json({ error: "A planilha está vazia." }, { status: 400 });
  }

  let created = 0;
  const errors: string[] = [];
  for (const [index, row] of rows.entries()) {
    try {
      await issueCertificate({ templateId, values: row, issuedById: user.id });
      created += 1;
    } catch (error) {
      errors.push(`Linha ${index + 2}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }

  return NextResponse.json({ created, errors });
}

async function parseRows(file: File): Promise<Record<string, string>[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
}
