import Link from "next/link";
import { BadgeCheck, Eye, Pencil, Search, Star, X } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { TemplateActions } from "@/components/templates/template-actions";
import { UploadTemplateButton } from "@/components/templates/upload-template-button";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Modelos — TCS Certificados" };
export const dynamic = "force-dynamic";

type TemplatesSearchParams = Promise<{
  q?: string | string[];
}>;

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: TemplatesSearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;
  const query = textParam(params.q);
  const templates = await prisma.certificateTemplate.findMany({
    where: buildTemplateWhere(query),
    include: { variables: true, _count: { select: { batches: true, issues: true } } },
    orderBy: [{ issues: { _count: "desc" } }, { updatedAt: "desc" }],
  });
  const mostUsedTemplates = query ? [] : templates.filter((template) => template._count.issues > 0).slice(0, 4);

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Modelos</h1>
          <p className="page-subtitle">Crie layouts com variáveis e QR Code de validação.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.625rem" }}>
          <UploadTemplateButton />
          <Link href="/modelos/novo" className="btn btn-primary">
            + Novo modelo
          </Link>
        </div>
      </div>

      <form
        action="/modelos"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.625rem",
          alignItems: "end",
          marginBottom: "1rem",
        }}
      >
        <label className="field" style={{ flex: "1 1 260px", margin: 0 }}>
          <span className="field-label">Pesquisar modelo</span>
          <div style={{ position: "relative" }}>
            <Search
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 16,
                height: 16,
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              name="q"
              defaultValue={query}
              placeholder="Nome, descrição ou variável"
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>
        </label>
        <button type="submit" className="btn btn-primary">
          <Search style={{ width: 16, height: 16 }} />
          Buscar
        </button>
        {query ? (
          <Link href="/modelos" className="btn btn-ghost" title="Limpar pesquisa">
            <X style={{ width: 16, height: 16 }} />
            Limpar
          </Link>
        ) : null}
      </form>

      {mostUsedTemplates.length ? (
        <section style={{ marginBottom: "1.25rem" }} aria-label="Modelos mais usados">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Star style={{ width: 18, height: 18, color: "var(--brand-500)" }} />
            <h2 className="section-title" style={{ margin: 0 }}>Modelos mais usados</h2>
          </div>
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {mostUsedTemplates.map((template) => {
              const pageCount = getTemplatePageCount(template.layout);

              return (
                <Link
                  key={template.id}
                  href={`/certificados/emitir?template=${template.id}`}
                  className="dark-card"
                  style={{ display: "block", textDecoration: "none", padding: "1rem" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "start" }}>
                    <div>
                      <h3 style={{ color: "var(--text-primary)", fontSize: "0.9375rem", fontWeight: 700, marginBottom: "0.35rem" }}>
                        {template.name}
                      </h3>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                        {template._count.issues} emissões
                      </p>
                    </div>
                    <span className="chip chip-brand">{formatPageCount(pageCount)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {templates.length ? (
        <section aria-label="Lista de modelos">
          <h2 className="section-title" style={{ marginBottom: "0.75rem" }}>
            {query ? "Resultado da pesquisa" : "Todos os modelos"}
          </h2>
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {templates.map((template) => {
            const pageCount = getTemplatePageCount(template.layout);

            return (
              <article key={template.id} className="dark-card" style={{ display: "grid", gap: "1rem" }}>
                <Link
                  href={`/modelos/${template.id}`}
                  style={{ display: "block", textDecoration: "none" }}
                >
                  <h2
                    style={{
                      fontWeight: 700,
                      fontSize: "0.9375rem",
                      color: "var(--text-primary)",
                      marginBottom: "0.375rem",
                      transition: "color 150ms",
                    }}
                  >
                    {template.name}
                  </h2>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {template.description || "Sem descrição"}
                  </p>
                </Link>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
                  <span className="chip chip-brand">{formatPageCount(pageCount)}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                    {template._count.issues} emissões
                  </span>
                </div>

                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <Link
                      href={`/modelos/${template.id}`}
                      className="btn btn-ghost"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        fontSize: "0.8125rem",
                        justifyContent: "center",
                      }}
                    >
                      <Eye style={{ width: 14, height: 14 }} />
                      Visualizar
                    </Link>
                    <Link
                      href={`/modelos/${template.id}/editar`}
                      className="btn btn-ghost"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        fontSize: "0.8125rem",
                        justifyContent: "center",
                      }}
                    >
                      <Pencil style={{ width: 14, height: 14 }} />
                      Editar
                    </Link>
                  </div>
                  <Link
                    href={`/certificados/emitir?template=${template.id}`}
                    className="btn btn-primary"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      fontSize: "0.8125rem",
                      flex: 1,
                      justifyContent: "center",
                    }}
                  >
                    <BadgeCheck style={{ width: 14, height: 14 }} />
                    Emitir
                  </Link>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <TemplateActions id={template.id} />
                  </div>
                </div>
              </article>
            );
            })}
          </div>
        </section>
      ) : (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            background: "var(--surface-1)",
            border: "1px dashed var(--border-muted)",
            borderRadius: "var(--radius-lg)",
            color: "var(--text-muted)",
          }}
        >
          {query ? "Nenhum modelo encontrado para a pesquisa." : "Nenhum modelo cadastrado ainda."}
        </div>
      )}
    </div>
  );
}

function textParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "").trim();
}

function buildTemplateWhere(query: string): Prisma.CertificateTemplateWhereInput | undefined {
  if (!query) return undefined;

  return {
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      {
        variables: {
          some: {
            OR: [
              { key: { contains: query, mode: "insensitive" } },
              { label: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

function getTemplatePageCount(layout: Prisma.JsonValue) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) return 1;

  const pages = (layout as { basePages?: unknown }).basePages;
  return Array.isArray(pages) && pages.length > 0 ? pages.length : 1;
}

function formatPageCount(pageCount: number) {
  return pageCount === 1 ? "1 página" : `${pageCount} páginas`;
}
