import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, BadgeCheck, FileText, LayoutDashboard, Users, Upload } from "lucide-react";
import { Role } from "@prisma/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: [Role.ADMIN, Role.OPERADOR] },
  { href: "/modelos", label: "Modelos", icon: FileText, roles: [Role.ADMIN] },
  { href: "/certificados/emitir", label: "Emitir", icon: BadgeCheck, roles: [Role.ADMIN, Role.OPERADOR] },
  { href: "/certificados/lote", label: "Lote", icon: Upload, roles: [Role.ADMIN, Role.OPERADOR] },
  { href: "/certificados/historico", label: "Histórico", icon: FileText, roles: [Role.ADMIN, Role.OPERADOR] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: [Role.ADMIN] },
] satisfies Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}>;

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-lg bg-teal-700 text-lg font-bold text-white">
            TC
          </span>
          <span>
            <span className="block text-base font-bold">TCS Certificados</span>
            <span className="text-xs text-slate-500">Painel de emissão</span>
          </span>
        </Link>

        <nav className="mt-8 space-y-1">
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="absolute bottom-5 left-5 right-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold">{user.name}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
          <p className="mt-2 inline-flex rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">
            {user.role}
          </p>
          <form action={logout} className="mt-4">
            <button className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
              <LogOut className="size-4" />
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

async function logout() {
  "use server";
  const { destroySession } = await import("@/lib/auth");
  await destroySession();
  redirect("/login");
}
