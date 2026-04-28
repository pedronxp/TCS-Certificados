import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <section>
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="mt-1 text-sm text-slate-500">Cadastre admins e operadores.</p>
        <form action="/api/users" method="post" className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
          <div className="space-y-4">
            <label className="field">
              <span>Nome</span>
              <input name="name" required />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input name="email" type="email" required />
            </label>
            <label className="field">
              <span>Senha</span>
              <input name="password" type="password" required minLength={8} />
            </label>
            <label className="field">
              <span>Perfil</span>
              <select name="role" defaultValue="OPERADOR">
                <option value="OPERADOR">Operador</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          </div>
          <button className="mt-5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">
            Criar usuário
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold">Usuários cadastrados</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold">{user.role}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
