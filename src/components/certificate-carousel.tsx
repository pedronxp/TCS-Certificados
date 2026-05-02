"use client";

import { useEffect, useState, useCallback } from "react";

export interface CertCard {
  id: string;
  recipientInitials: string;
  recipientMasked: string;
  course: string;
  institution: string;
  issuedAt: string;
  code: string;
  status: "Válido" | "Emitido";
}

interface Props {
  cards: CertCard[];
}

const GRADIENTS = [
  "linear-gradient(135deg, #4f46e5, #7c3aed)",
  "linear-gradient(135deg, #0891b2, #6366f1)",
  "linear-gradient(135deg, #7c3aed, #c026d3)",
  "linear-gradient(135deg, #059669, #0891b2)",
  "linear-gradient(135deg, #d97706, #dc2626)",
  "linear-gradient(135deg, #be185d, #7c3aed)",
  "linear-gradient(135deg, #0e7490, #059669)",
  "linear-gradient(135deg, #92400e, #d97706)",
];

export function CertificateCarousel({ cards }: Props) {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle");

  const goTo = useCallback(
    (idx: number) => {
      if (phase !== "idle" || idx === active) return;
      setPhase("exit");
      setTimeout(() => {
        setActive(idx);
        setPhase("enter");
        setTimeout(() => setPhase("idle"), 480);
      }, 320);
    },
    [phase, active],
  );

  const next = useCallback(() => {
    goTo((active + 1) % cards.length);
  }, [active, cards.length, goTo]);

  // Auto-advance every 3.5s
  useEffect(() => {
    if (cards.length <= 1) return;
    const timer = setInterval(next, 3500);
    return () => clearInterval(timer);
  }, [next, cards.length]);

  if (!cards.length) return null;

  const card = cards[active];
  const gradient = GRADIENTS[active % GRADIENTS.length];

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.045)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: "1.375rem 1.5rem",
    backdropFilter: "blur(20px)",
    boxShadow:
      "0 28px 56px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset",
    willChange: "transform, opacity",
    animation:
      phase === "exit"
        ? "certExit 0.32s cubic-bezier(0.4,0,1,1) both"
        : phase === "enter"
          ? "certEnter 0.48s cubic-bezier(0.16,1,0.3,1) both"
          : phase === "idle" && active === 0
            ? "certEnter 0.48s cubic-bezier(0.16,1,0.3,1) both"
            : undefined,
  };

  return (
    <div style={{ width: "100%", maxWidth: 340, margin: "0 auto" }}>
      {/* ── Card ── */}
      <div style={cardStyle}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "1.125rem",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.9375rem",
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
              boxShadow: "0 4px 14px rgba(0,0,0,0.45)",
              letterSpacing: "-0.02em",
            }}
          >
            {card.recipientInitials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Certificado Emitido
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>
              {card.issuedAt}
            </p>
          </div>

          {/* Status badge */}
          <div
            style={{
              padding: "0.2rem 0.65rem",
              borderRadius: 99,
              fontSize: "0.7375rem",
              fontWeight: 700,
              background:
                card.status === "Válido"
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(99,102,241,0.2)",
              color: card.status === "Válido" ? "#86efac" : "#a5b4fc",
              border: `1px solid ${card.status === "Válido" ? "rgba(34,197,94,0.35)" : "rgba(99,102,241,0.4)"}`,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {card.status}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.07)",
            margin: "0 0 1.125rem",
          }}
        />

        {/* Recipient name — blurred */}
        <p
          style={{
            fontSize: "1.0625rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "0.01em",
            filter: "blur(3.5px)",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {card.recipientMasked}
        </p>

        {/* Course name */}
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            marginTop: "0.375rem",
            lineHeight: 1.45,
          }}
        >
          {card.course}
        </p>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          {/* Institution */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 120,
              }}
            >
              {card.institution}
            </span>
          </div>

          {/* Code — blurred */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--text-muted)", flexShrink: 0 }}
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--text-muted)",
                filter: "blur(3px)",
                userSelect: "none",
                WebkitUserSelect: "none",
                fontFamily: "monospace",
                letterSpacing: "0.04em",
              }}
            >
              {card.code}
            </span>
          </div>
        </div>

        {/* Validation row */}
        <div
          style={{
            marginTop: "1rem",
            padding: "0.625rem 0.875rem",
            borderRadius: 10,
            background: "rgba(99,102,241,0.07)",
            border: "1px solid rgba(99,102,241,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(99,102,241,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: "var(--brand-400)" }}
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div>
            <p
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              Validação pública disponível
            </p>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 1 }}>
              Autêntico · TCS Certificados
            </p>
          </div>
        </div>
      </div>

      {/* ── Dots ── */}
      {cards.length > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.45rem",
            marginTop: "1.25rem",
          }}
        >
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Certificado ${i + 1}`}
              style={{
                width: i === active ? 22 : 6,
                height: 6,
                borderRadius: 99,
                border: "none",
                cursor: "pointer",
                background:
                  i === active
                    ? "linear-gradient(90deg, var(--brand-500), var(--accent-500))"
                    : "rgba(255,255,255,0.18)",
                transition: "all 0.38s cubic-bezier(0.16,1,0.3,1)",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes certEnter {
          0%   { opacity: 0; transform: scale(0.86) translateY(20px); }
          55%  { opacity: 1; transform: scale(1.025) translateY(-4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes certExit {
          0%   { opacity: 1; transform: scale(1) translateY(0); }
          100% { opacity: 0; transform: scale(0.9) translateY(-14px); }
        }
      `}</style>
    </div>
  );
}
