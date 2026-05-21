"use client";

import { useState, type ReactNode } from "react";
import { AppTopbar } from "@/components/app-topbar";

export function AppFrame({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [sidebarDocked, setSidebarDocked] = useState(true);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  function handleMenuClick() {
    if (window.matchMedia("(max-width: 1024px)").matches) {
      setSidebarDrawerOpen(true);
      return;
    }

    if (sidebarDocked) {
      setSidebarDocked(false);
      return;
    }

    setSidebarDrawerOpen(true);
  }

  function closeDrawer() {
    setSidebarDrawerOpen(false);
  }

  function closeSidebar() {
    setSidebarDrawerOpen(false);
    setSidebarDocked(false);
  }

  return (
    <div
      className={[
        "app-frame",
        sidebarDocked ? "app-frame-sidebar-docked" : "",
        sidebarDrawerOpen ? "app-frame-sidebar-drawer-open" : "",
      ].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="app-sidebar-overlay"
        aria-label="Fechar menu lateral"
        onClick={closeSidebar}
      />

      <aside
        className="sidebar"
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a")) closeDrawer();
        }}
      >
        {sidebar}
      </aside>

      <main className="app-main" onMouseDown={closeSidebar}>
        <AppTopbar onMenuClick={handleMenuClick} />
        <div className="app-main-container">
          {children}
        </div>
      </main>
    </div>
  );
}
