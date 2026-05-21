"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, Menu } from "lucide-react";

const routeTitles = [
  { href: "/dashboard", title: "Dashboard", subtitle: "Ambiente privado" },
  { href: "/certificados/emitir", title: "Emitir", subtitle: "Certificado individual" },
  { href: "/certificados/lote", title: "Emissão em lote", subtitle: "Fluxo guiado" },
  { href: "/certificados/concluido", title: "Certificado pronto", subtitle: "Baixe, envie e acompanhe" },
  { href: "/certificados/historico", title: "Histórico", subtitle: "Consulta e ciclo de vida" },
  { href: "/modelos", title: "Modelos", subtitle: "Layouts oficiais" },
  { href: "/usuarios", title: "Usuários", subtitle: "Acessos e permissões" },
  { href: "/variaveis", title: "Variáveis", subtitle: "Guia de campos e exemplos" },
];

function getRouteInfo(pathname: string) {
  return (
    routeTitles
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? routeTitles[0]
  );
}

export function AppTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const route = getRouteInfo(pathname);
  const showActions = pathname !== "/dashboard";

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <button
          type="button"
          className="mobile-menu-button app-topbar-menu"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onMenuClick}
        >
          <Menu className="size-5" />
          <span className="sr-only">Abrir ou ocultar menu</span>
        </button>
        <div className="app-topbar-title">
          <strong>{route.title}</strong>
          <span>{route.subtitle}</span>
        </div>
      </div>
      {showActions ? (
        <div className="app-topbar-actions">
          <Link href="/certificados/historico" className="btn btn-ghost app-topbar-secondary">
            Histórico
          </Link>
          <Link href="/certificados/emitir" className="btn btn-primary">
            <BadgeCheck className="size-4" />
            Emitir certificado
          </Link>
        </div>
      ) : null}
    </header>
  );
}
