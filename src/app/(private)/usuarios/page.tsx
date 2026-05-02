import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Usuários — TCS Certificados" };
export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  OPERADOR: "Usuário",
};

export default async function UsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuários</h1>
          <p className="page-subtitle">Cadastre administradores e operadores do sistema.</p>
        </div>
      </div>

      <div
        className="users-grid"
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)",
        }}
      >
        {/* ── Create Form ── */}
        <section>
          <div className="dark-form-panel">
            <h2 className="section-title">Novo usuário</h2>
            <p className="section-subtitle">Preencha os dados para criar uma conta de acesso.</p>

            <form action="/api/users" method="post" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label className="field">
                <span className="field-label">Nome completo</span>
                <input name="name" required placeholder="Ex.: João da Silva" />
              </label>
              <label className="field">
                <span className="field-label">E-mail</span>
                <input name="email" type="email" required placeholder="usuario@empresa.com" />
              </label>
              <label className="field">
                <span className="field-label">Senha</span>
                <input name="password" type="password" required minLength={8} placeholder="Mínimo 8 caracteres" />
              </label>
              <label className="field">
                <span className="field-label">Perfil de acesso</span>
                <select name="role" defaultValue="OPERADOR">
                  <option value="OPERADOR">Usuário</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>
              <button type="submit" className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                Criar usuário
              </button>
            </form>
          </div>
        </section>

        {/* ── Users List ── */}
        <section className="dark-card-flat">
          <div className="dark-card-header">
            <h2>Usuários cadastrados</h2>
            <span
              className="chip chip-brand"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {users.length} total
            </span>
          </div>

          {users.length ? (
            <div>
              {users.map((user) => (
                <div key={user.id} className="dark-list-row">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
                    {/* Avatar initials */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: "linear-gradient(135deg, var(--brand-600), var(--accent-500))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        color: "#fff",
                        flexShrink: 0,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {user.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0].toUpperCase())
                        .join("")}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                        {user.name}
                      </p>
                      <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: 2 }}>
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span className={`chip ${user.role === "ADMIN" ? "chip-brand" : ""}`}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {user.createdAt.toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Nenhum usuário cadastrado.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
