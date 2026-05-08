import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { Role } from "@prisma/client";
import { AppTopbar } from "@/components/app-topbar";
import { BatchProgressToast } from "@/components/certificates/batch-progress-toast";
import { BrandLogo } from "@/components/brand-logo";
import { SidebarNav } from "@/components/sidebar-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const roleLabels: Record<Role, string> = {
  ADMIN: "ADMIN",
  OPERADOR: "USUÁRIO",
};

export function AppShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: Role };
  children: React.ReactNode;
}) {
  const initials =
    user.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U";

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-0)", color: "var(--text-primary)" }}>
      {/* Mobile Sidebar Toggle (CSS only) */}
      <input type="checkbox" id="mobile-sidebar-toggle" className="mobile-sidebar-toggle-input" hidden aria-hidden="true" />

      {/* Sidebar Overlay */}
      <label htmlFor="mobile-sidebar-toggle" className="mobile-sidebar-overlay"></label>

      <aside className="sidebar">
        <Link href="/dashboard" className="sidebar-logo-link">
          <span className="sidebar-logo-mark brand-logo-mark" aria-hidden="true">
            <BrandLogo decorative priority sizes="56px" />
          </span>
          <span className="sidebar-logo-text">
            <span className="sidebar-logo-title">TCS Certificados</span>
            <span className="sidebar-logo-subtitle">Painel de emissão</span>
          </span>
        </Link>

        <SidebarNav role={user.role} />

        <div className="sidebar-user-card">
          <div className="sidebar-user-main">
            <div className="sidebar-user-avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="sidebar-user-copy" title={user.email}>
              <p className="sidebar-user-name">{user.name}</p>
              <p className="sidebar-user-email">{user.email}</p>
            </div>
          </div>

          <div className="sidebar-user-actions">
            <span className="badge badge-brand">{roleLabels[user.role]}</span>
            <div className="sidebar-user-buttons">
              <ThemeToggle />
              <form action={logout}>
                <button type="submit" className="sidebar-logout-button" title="Sair">
                  <LogOut style={{ width: 14, height: 14 }} />
                  <span className="sr-only">Sair</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <main className="app-main">
        <AppTopbar />
        <div className="app-main-container">
          {children}
        </div>
      </main>

      <BatchProgressToast />
    </div>
  );
}

async function logout() {
  "use server";
  const { destroySession } = await import("@/lib/auth");
  await destroySession();
  redirect("/login");
}
