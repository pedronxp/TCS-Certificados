import "dotenv/config";
import { Role } from "@prisma/client";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { syncTemplateFromImportedFile } from "../src/lib/template-import-service";

const COURSE_DIR = path.join(process.cwd(), "cursos");

const templates = [
  {
    pattern: /^Modelo certificado NR 06\.docx$/i,
    name: "V2 - NR 06",
    matchNames: ["V2 - NR 06"],
  },
  {
    pattern: /^Curo de Atendimento Pr/i,
    name: "V2 - Curo de Atendimento Pr\u00e9-Hospitalar",
    matchNames: ["V2 - Curo de Atendimento Pr\u00e9-Hospitalar"],
  },
  {
    pattern: /^Modelo COMBATE A INC/i,
    name: "V2 - Primeiro socorros",
    matchNames: ["V2 - Primeiro socorros"],
  },
  {
    pattern: /^Guindauto\.docx$/i,
    name: "V2 - Guindauto",
    matchNames: ["V2 - Guindauto"],
  },
  {
    pattern: /^Guindauto com empresa\.docx$/i,
    name: "V2 - Guindauto 2 (para empresa)",
    matchNames: ["V2 - Guindauto 2 (para empresa)"],
  },
  {
    pattern: /^Curso de injet/i,
    name: "V2 - Curso Livre de Aplica\u00e7\u00e3o de Injet\u00e1veis",
    matchNames: ["V2 - Curso Livre de Aplica\u00e7\u00e3o de Injet\u00e1veis"],
  },
  {
    pattern: /^Curso de SBV\.docx$/i,
    name: "V2 - Curso de SBV",
    matchNames: ["V2 - Curso de SBV"],
  },
  {
    pattern: /^Retroescavadeira\.docx$/i,
    name: "V2 - Retroescavadeira",
    matchNames: ["V2 - Retroescavadeira"],
  },
  {
    pattern: /^NR 31\.docx$/i,
    name: "V2 - NR31",
    matchNames: ["V2 - NR31"],
  },
  {
    pattern: /^Curso NR 12 Motosserra e Ro/i,
    name: "V2 - Curso NR 12 Motosserra e Ro\u00e7adeira",
    matchNames: ["V2 - Curso NR 12 Motosserra e Ro\u00e7adeira"],
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
