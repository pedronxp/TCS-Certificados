import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@tcs.local";
  const password = process.env.ADMIN_PASSWORD ?? "admin123456";

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: process.env.ADMIN_NAME ?? "Administrador",
      email,
      passwordHash: await hash(password, 12),
      role: Role.ADMIN,
    },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
