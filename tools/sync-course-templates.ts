import "dotenv/config";
import { Role } from "@prisma/client";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { syncTemplateFromImportedFile } from "../src/lib/template-import-service";

const COURSE_DIR = path.join(process.cwd(), "cursos");

const templates = [
  {
    pattern: /^NR18\.docx$/i,
    name: "NR 18",
    matchNames: ["NR18", "NR 18"],
  },
  {
    pattern: /^NR 20\.\.docx$/i,
    name: "NR 20",
    matchNames: ["NR 20", "NR 20.", "Certificado NR 20."],
  },
  {
    pattern: /^Curso de injet/i,
    name: "Curso de injet\u00e1vel",
    matchNames: ["Curso de injet\u00e1vel"],
  },
  {
    pattern: /^Lei Lucas\.docx$/i,
    name: "Lei Lucas",
    matchNames: ["Lei Lucas"],
  },
  {
    pattern: /^Rapel\.pptx$/i,
    name: "Rapel",
    matchNames: ["Rapel"],
  },
  {
    pattern: /^Retroescavadeira\.docx$/i,
    name: "Retroescavadeira",
    matchNames: ["Retroescavadeira", "RetroEscavadeira"],
  },
];

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!admin) {
    throw new Error("Nenhum administrador encontrado para vincular os modelos.");
  }

  const courseFiles = await readdir(COURSE_DIR);

  for (const template of templates) {
    const fileName = findCourseFile(courseFiles, template.pattern);
    const buffer = await readFile(path.join(COURSE_DIR, fileName));
    const synced = await syncTemplateFromImportedFile({
      fileName,
      buffer,
      createdById: admin.id,
      name: template.name,
      matchNames: template.matchNames,
    });

    console.log(`OK ${synced.name}: ${synced.variables.map((variable) => variable.key).join(", ")}`);
  }
}

function findCourseFile(files: string[], pattern: RegExp) {
  const fileName = files.find((name) => !name.startsWith("~$") && pattern.test(name));
  if (!fileName) {
    throw new Error(`Arquivo de curso nao encontrado: ${pattern}`);
  }

  return fileName;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
