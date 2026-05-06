"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function subscribeToThemeChange(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("themechange", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("themechange", onStoreChange);
  };
}

export function ThemeToggle() {
  const mounted = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerSnapshot);
  const dark = useSyncExternalStore(subscribeToThemeChange, getThemeSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
    window.dispatchEvent(new Event("themechange"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={!mounted ? "Alternar tema" : dark ? "Modo claro" : "Modo escuro"}
      aria-label={!mounted ? "Alternar tema" : dark ? "Ativar modo claro" : "Ativar modo escuro"}
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: 32,
        height: 32,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-muted)",
        background: "var(--surface-2)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        transition: "all 150ms",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-3)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      {mounted && dark
        ? <Sun style={{ width: 14, height: 14 }} />
        : <Moon style={{ width: 14, height: 14 }} />}
    </button>
  );
}
