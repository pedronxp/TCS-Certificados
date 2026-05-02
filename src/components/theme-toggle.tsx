"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof document === "undefined" ? false : document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Modo claro" : "Modo escuro"}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
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
      {dark
        ? <Sun style={{ width: 14, height: 14 }} />
        : <Moon style={{ width: 14, height: 14 }} />}
    </button>
  );
}
