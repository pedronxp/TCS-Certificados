import Link from "next/link";
import { History } from "lucide-react";
import { IssueForm } from "@/components/certificates/issue-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Emitir Certificado — TCS Certificados" };
export const dynamic = "force-dynamic";

export default async function IssueCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const user = await requireUser();
  const selectedTemplateId = (await searchParams).template;
  const templates = await prisma.certificateTemplate.findMany({
    include: { variables: { orderBy: { key: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page-shell page-shell-narrow">
      <div className="page-header">
        <div>
          <h1 className="page-title">Emitir certificado</h1>
          <p className="page-subtitle">Selecione o modelo e preencha os campos obrigatórios.</p>
        </div>
        <Link
          href="/certificados/historico"
          className="btn btn-ghost"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
        >
          <History style={{ width: 16, height: 16 }} />
          Histórico
        </Link>
      </div>

      {templates.length ? (
        <IssueForm templates={templates} initialTemplateId={selectedTemplateId} currentUser={user} />
      ) : (
        <div
          style={{
            padding: "2.5rem",
            textAlign: "center",
            background: "var(--surface-1)",
            border: "1px dashed var(--border-muted)",
            borderRadius: "var(--radius-lg)",
            color: "var(--text-muted)",
            fontSize: "0.9rem",
          }}
        >
          Crie um modelo antes de emitir certificados.{" "}
          <Link href="/modelos/novo" style={{ color: "var(--brand-400)", textDecoration: "none", fontWeight: 600 }}>
            Criar modelo →
          </Link>
        </div>
      )}
    </div>
  );
}
