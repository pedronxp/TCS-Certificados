import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { CertificateStatus, Prisma } from "@prisma/client";
import { HistoryTable, type HistoryIssue } from "@/components/certificates/history-table";
import { requireUser } from "@/lib/auth";
import { deleteExpiredCertificateIssues } from "@/lib/certificate-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const pageSize = 25;
const certificateStatuses = ["ISSUED", "REVOKED"] satisfies CertificateStatus[];

type HistorySearchParams = Promise<{
  q?: string | string[];
  company?: string | string[];
  status?: string | string[];
  visibility?: string | string[];
  from?: string | string[];
  to?: string | string[];
  page?: string | string[];
}>;

export default async function CertificateHistoryPage({
  searchParams,
}: {
  searchParams: HistorySearchParams;
}) {
  const user = await requireUser();
  await deleteExpiredCertificateIssues().catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const params = await searchParams;
  const filters = parseFilters(params);
  const canManage = user.role === "ADMIN";
  const where = buildWhere(filters, { canManage, userId: user.id });

  const rows = await prisma.certificateIssue.findMany({
    where,
    take: pageSize + 1,
    skip: (filters.page - 1) * pageSize,
    select: {
      id: true,
      verificationCode: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      values: true,
      deleteAt: true,
      hiddenAt: true,
      recipient: {
        select: {
          name: true,
          email: true,
          document: true,
        },
      },
      template: {
        select: {
          name: true,
        },
      },
      issuedBy: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
  });

  const hasNextPage = rows.length > pageSize;
  const issues = rows.slice(0, pageSize).map<HistoryIssue>((issue) => ({
    id: issue.id,
    verificationCode: issue.verificationCode,
    status: issue.status,
    issuedAt: issue.issuedAt.toISOString(),
    revokedAt: issue.revokedAt?.toISOString() ?? null,
    deleteAt: toDateInputValue(issue.deleteAt),
    hiddenAt: issue.hiddenAt?.toISOString() ?? null,
    recipientName: issue.recipient.name,
    recipientEmail: issue.recipient.email,
    recipientDocument: issue.recipient.document,
    company: getCompanyName(issue.values),
    templateName: issue.template.name,
    issuedByName: issue.issuedBy.name,
  }));
  const start = issues.length ? (filters.page - 1) * pageSize + 1 : 0;
  const end = start + issues.length - 1;

  return (
    <div className="page-shell page-shell-wide">
      <div className="page-header">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="page-subtitle">
            Consulte certificados emitidos, filtre registros e baixe os arquivos gerados.
          </p>
        </div>
        <div
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1.25rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
            {issues.length}
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>
            {issues.length === 1 ? "registro nesta página" : "registros nesta página"}
          </p>
        </div>
      </div>

      <form className="filter-bar mt-6" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
        <label className="field" style={{ gridColumn: "span 5" }}>
          <span className="field-label">Buscar</span>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, pointerEvents: "none", color: "var(--text-muted)" }} />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Titular, código, modelo, e-mail ou documento"
              className="pl-9"
            />
          </div>
        </label>

        <label className="field" style={{ gridColumn: "span 4" }}>
          <span className="field-label">Empresa</span>
          <input
            name="company"
            defaultValue={filters.company}
            placeholder="Nome da empresa"
          />
        </label>

        <label className="field" style={{ gridColumn: "span 3" }}>
          <span className="field-label">Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos</option>
            <option value="ISSUED">Emitido</option>
            <option value="REVOKED">Revogado</option>
          </select>
        </label>

        <details
          className="filter-advanced"
          open={canManage ? filters.visibility !== "visible" || Boolean(filters.from || filters.to) : Boolean(filters.from || filters.to)}
          style={{ gridColumn: "span 9" }}
        >
          <summary>{canManage ? "Visibilidade e período" : "Período"}</summary>
          <div className="filter-advanced-grid">
            {canManage ? (
              <label className="field">
                <span className="field-label">Visibilidade</span>
                <select name="visibility" defaultValue={filters.visibility}>
                  <option value="visible">Visíveis</option>
                  <option value="hidden">Ocultos</option>
                  <option value="all">Todos</option>
                </select>
              </label>
            ) : null}

            <label className="field">
              <span className="field-label">De</span>
              <input name="from" type="date" defaultValue={filters.from} />
            </label>

            <label className="field">
              <span className="field-label">Até</span>
              <input name="to" type="date" defaultValue={filters.to} />
            </label>
          </div>
        </details>

        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", gridColumn: "span 3" }}>
          <button className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", height: 40 }}>
            <Search style={{ width: 16, height: 16 }} />
            Filtrar
          </button>
          <Link
            href="/certificados/historico"
            className="pagination-btn"
            title="Limpar filtros"
          >
            <X style={{ width: 16, height: 16 }} />
          </Link>
        </div>
      </form>

      <HistoryTable issues={issues} canManage={canManage} />

      <section
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          borderTop: "none",
          borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", padding: "0.875rem 1.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          <p>Mostrando {start}-{end}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <PaginationLink
              href={historyHref(filters, filters.page - 1)}
              disabled={filters.page <= 1}
              label="Página anterior"
              icon="previous"
            />
            <span style={{ minWidth: "6rem", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Página {filters.page}
            </span>
            <PaginationLink
              href={historyHref(filters, filters.page + 1)}
              disabled={!hasNextPage}
              label="Próxima página"
              icon="next"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function parseFilters(params: Awaited<HistorySearchParams>) {
  const status = firstParam(params.status);
  const visibility = parseVisibility(firstParam(params.visibility));
  const page = Number.parseInt(firstParam(params.page) || "1", 10);

  return {
    q: firstParam(params.q).trim(),
    company: firstParam(params.company).trim(),
    status: certificateStatuses.includes(status as CertificateStatus) ? (status as CertificateStatus) : undefined,
    visibility,
    from: normalizeDateInput(firstParam(params.from)),
    to: normalizeDateInput(firstParam(params.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function buildWhere(
  filters: ReturnType<typeof parseFilters>,
  scope: { canManage: boolean; userId: string },
): Prisma.CertificateIssueWhereInput {
  const and: Prisma.CertificateIssueWhereInput[] = [];

  if (!scope.canManage) {
    and.push({ issuedById: scope.userId, hiddenAt: null });
  }

  if (filters.q) {
    and.push({
      OR: [
        { verificationCode: { contains: filters.q, mode: "insensitive" } },
        {
          recipient: {
            is: {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { email: { contains: filters.q, mode: "insensitive" } },
                { document: { contains: filters.q, mode: "insensitive" } },
              ],
            },
          },
        },
        { template: { is: { name: { contains: filters.q, mode: "insensitive" } } } },
        {
          issuedBy: {
            is: {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { email: { contains: filters.q, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }

  if (filters.status) {
    and.push({ status: filters.status });
  }

  if (filters.company) {
    and.push({
      OR: [
        {
          values: {
            path: ["empresa"],
            string_contains: filters.company,
            mode: "insensitive",
          },
        },
        {
          values: {
            path: ["company"],
            string_contains: filters.company,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (filters.visibility === "visible") {
    and.push({ hiddenAt: null });
  }

  if (filters.visibility === "hidden") {
    and.push({ hiddenAt: { not: null } });
  }

  if (filters.from || filters.to) {
    and.push({
      issuedAt: {
        gte: filters.from ? new Date(`${filters.from}T00:00:00`) : undefined,
        lte: filters.to ? new Date(`${filters.to}T23:59:59.999`) : undefined,
      },
    });
  }

  return and.length ? { AND: and } : {};
}

function getCompanyName(values: unknown) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return "Sem empresa";

  const issueValues = values as Record<string, unknown>;
  for (const key of ["empresa", "company"]) {
    const companyName = String(issueValues[key] ?? "").trim();
    if (companyName) return companyName;
  }

  return "Sem empresa";
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function parseVisibility(value: string) {
  return value === "hidden" || value === "all" ? value : "visible";
}

function toDateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function historyHref(filters: ReturnType<typeof parseFilters>, page: number) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.company) params.set("company", filters.company);
  if (filters.status) params.set("status", filters.status);
  if (filters.visibility !== "visible") params.set("visibility", filters.visibility);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/certificados/historico?${query}` : "/certificados/historico";
}

function PaginationLink({
  href,
  disabled,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: "previous" | "next";
}) {
  const iconElement = icon === "previous"
    ? <ChevronLeft style={{ width: 16, height: 16 }} />
    : <ChevronRight style={{ width: 16, height: 16 }} />;

  if (disabled) {
    return (
      <span className="pagination-btn disabled" title={label}>
        {iconElement}
      </span>
    );
  }

  return (
    <Link href={href} className="pagination-btn" title={label}>
      {iconElement}
    </Link>
  );
}
