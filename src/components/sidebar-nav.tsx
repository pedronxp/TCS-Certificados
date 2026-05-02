"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, FileText, LayoutDashboard, Upload, Users } from "lucide-react";

type UserRole = "ADMIN" | "OPERADOR";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "OPERADOR"] },
  { href: "/certificados/emitir", label: "Emitir", icon: BadgeCheck, roles: ["ADMIN", "OPERADOR"] },
  { href: "/certificados/lote", label: "Emitir em lote", icon: Upload, roles: ["ADMIN"] },
  { href: "/certificados/historico", label: "Histórico", icon: FileText, roles: ["ADMIN", "OPERADOR"] },
  { href: "/modelos", label: "Modelos", icon: FileText, roles: ["ADMIN"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMIN"] },
] satisfies Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}>;

export function SidebarNav({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav" aria-label="Navegação principal">
      <p className="sidebar-nav-title">Menu</p>
      {navItems
        .filter((item) => item.roles.includes(role))
        .map((item) => {
          const active = item.href === "/dashboard"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="sidebar-link"
              aria-current={active ? "page" : undefined}
            >
              <span className="sidebar-link-icon" aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <span className="sidebar-link-label">{item.label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
