import Link from "next/link";
import { ChevronLeft, ChevronRight, Database, FileText, Hash, ListChecks, Search, X } from "lucide-react";
import type { CertificateStatus, Prisma } from "@prisma/client";
import { HistoryTable, type HistoryIssue } from "@/components/certificates/history-table";
import { requireUser } from "@/lib/auth";
import { isCertificateDocumentExpired } from "@/lib/certificate-validity";
import { expireScheduledCertificateDocuments } from "@/lib/certificate-service";
import { getTemplateNativeFileType } from "@/lib/certificate-output-format";
import { prisma } from "@/lib/prisma";
import { normalizeVerificationCode } from "@/lib/verification-code";

export const dynamic = "force-dynamic";

const pageSize = 25;
const certificateStatuses = ["ISSUED", "REVOKED"] satisfies CertificateStatus[];

type HistorySearchParams = Promise<{
  q?: string | string[];
  company?: string | string[];
  status?: string | string[];
  visibility?: string | string[];
  availability?: string | string[];
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
  const now = new Date();
  await expireScheduledCertificateDocuments(now).catch((error) => {
    console.error("Falha ao limpar certificados com prazo vencido", error);
  });

  const params = await searchParams;
  const filters = parseFilters(params);
  const canManage = user.role === "ADMIN";
  const where = buildWhere(filters, { canManage, userId: user.id, now });

  const [rows, totalResults, sequence, resettableCount] = await Promise.all([
    prisma.certificateIssue.findMany({
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
            layout: true,
          },
        },
        issuedBy: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    }),
    prisma.certificateIssue.count({ where }),
    prisma.certificateSequence.findUnique({
      where: { id: "global" },
      select: { value: true },
    }),
    canManage ? prisma.certificateIssue.count() : Promise.resolve(0),
  ]);

  const hasNextPage = rows.length > pageSize;
  const issues = rows.slice(0, pageSize).map<HistoryIssue>((issue) => {
    const documentExpired = isCertificateDocumentExpired(issue.deleteAt, now);
    const nativeFileType = getTemplateNativeFileType(issue.template.layout);

    return {
      id: issue.id,
      verificationCode: issue.verificationCode,
      status: issue.status,
      issuedAt: issue.issuedAt.toISOString(),
      revokedAt: issue.revokedAt?.toISOString() ?? null,
      deleteAt: toDateInputValue(issue.deleteAt),
      hiddenAt: issue.hiddenAt?.toISOString() ?? null,
      documentExpired,
      documentAvailable: !documentExpired,
      recipientName: issue.recipient.name,
      recipientEmail: issue.recipient.email,
      recipientDocument: issue.recipient.document,
      company: getCompanyName(issue.values),
      templateName: issue.template.name,
      issuedByName: issue.issuedBy.name,
      nativeDownloadType: nativeFileType.toLowerCase() as "docx" | "pptx",
      nativeDownloadLabel: nativeFileType,
    };
  });

  const start = issues.length ? (filters.page - 1) * pageSize + 1 : 0;
  const end = start + issues.length - 1;
  const sequenceValue = sequence?.value ?? 0;

  return (
    <div className="page-shell page-shell-wide history-page">
      <section className="history-hero">
        <div className="history-hero-copy">
          <span className="history-eyebrow">Certificados</span>
          <h1 className="page-title">Histórico de emissões</h1>
          <p className="page-subtitle">
            Consulte emissões, acompanhe documentos e administre a sequência de validação.
          </p>
        </div>
        <Link href="/certificados/emitir" className="btn btn-primary history-hero-button">
          <FileText style={{ width: 16, height: 16 }} />
          Nova emissão
        </Link>
      </section>

      <section className="history-metrics" aria-label="Resumo do histórico">
        <MetricCard
          icon={<ListChecks style={{ width: 18, height: 18 }} />}
          label="Resultados"
          value={String(totalResults)}
          helper="com os filtros atuais"
        />
        <MetricCard
          icon={<FileText style={{ width: 18, height: 18 }} />}
          label="Nesta página"
          value={String(issues.length)}
          helper={`página ${filters.page}`}
        />
        <MetricCard
          icon={<Hash style={{ width: 18, height: 18 }} />}
          label="Contagem atual"
          value={formatSequenceValue(sequenceValue)}
          helper="último número reservado"
        />
        <MetricCard
          icon={<Database style={{ width: 18, height: 18 }} />}
          label="Próxima emissão"
          value={formatSequenceValue(sequenceValue + 1)}
          helper="após o próximo certificado"
        />
      </section>

      <form className="history-filter">
        <div className="history-filter-main">
          <label className="field history-filter-search">
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

          <label className="field history-filter-company">
            <span className="field-label">Empresa</span>
            <input
              name="company"
              defaultValue={filters.company}
              placeholder="Nome da empresa"
            />
          </label>

          <label className="field history-filter-status">
            <span className="field-label">Status</span>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Todos</option>
              <option value="ISSUED">Emitido</option>
              <option value="REVOKED">Revogado</option>
            </select>
          </label>

          <div className="history-filter-actions">
            <button type="submit" className="btn btn-primary">
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
        </div>

        <details
          className="filter-advanced history-filter-advanced"
          open={canManage ? filters.visibility !== "visible" || filters.availability !== "all" || Boolean(filters.from || filters.to) : filters.availability !== "all" || Boolean(filters.from || filters.to)}
        >
          <summary>{canManage ? "Visibilidade, documentos e período" : "Documentos e período"}</summary>
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
              <span className="field-label">Documentos</span>
              <select name="availability" defaultValue={filters.availability}>
                <option value="all">Todos</option>
                <option value="available">Disponíveis</option>
                <option value="scheduled">Programados</option>
                <option value="expired">Expirados</option>
              </select>
            </label>

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
      </form>

      <HistoryTable
        issues={issues}
        canManage={canManage}
        totalResults={totalResults}
        resettableCount={resettableCount}
        sequenceValue={sequenceValue}
      />

      <section className="history-pagination">
        <p>Mostrando {start}-{end} de {totalResults}</p>
        <div className="history-pagination-controls">
          <PaginationLink
            href={historyHref(filters, filters.page - 1)}
            disabled={filters.page <= 1}
            label="Página anterior"
            icon="previous"
          />
          <span className="history-page-counter">
            Página {filters.page}
          </span>
          <PaginationLink
            href={historyHref(filters, filters.page + 1)}
            disabled={!hasNextPage}
            label="Próxima página"
            icon="next"
          />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="history-metric">
      <span className="history-metric-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  );
}

function parseFilters(params: Awaited<HistorySearchParams>) {
  const status = firstParam(params.status);
  const visibility = parseVisibility(firstParam(params.visibility));
  const availability = parseAvailability(firstParam(params.availability));
  const page = Number.parseInt(firstParam(params.page) || "1", 10);

  return {
    q: firstParam(params.q).trim(),
    company: firstParam(params.company).trim(),
    status: certificateStatuses.includes(status as CertificateStatus) ? (status as CertificateStatus) : undefined,
    visibility,
    availability,
    from: normalizeDateInput(firstParam(params.from)),
    to: normalizeDateInput(firstParam(params.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function buildWhere(
  filters: ReturnType<typeof parseFilters>,
  scope: { canManage: boolean; userId: string; now: Date },
): Prisma.CertificateIssueWhereInput {
  const and: Prisma.CertificateIssueWhereInput[] = [];

  if (!scope.canManage) {
    and.push({ issuedById: scope.userId, hiddenAt: null });
  }

  if (filters.q) {
    const normalizedCode = normalizeVerificationCode(filters.q);
    const verificationCodeFilters: Prisma.CertificateIssueWhereInput[] = [
      { verificationCode: { contains: filters.q, mode: "insensitive" } },
    ];

    if (normalizedCode && normalizedCode !== filters.q) {
      verificationCodeFilters.push({ verificationCode: { contains: normalizedCode, mode: "insensitive" } });
    }

    and.push({
      OR: [
        ...verificationCodeFilters,
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

  if (filters.availability === "available") {
    and.push({
      OR: [
        { deleteAt: null },
        { deleteAt: { gt: scope.now } },
      ],
    });
  }

  if (filters.availability === "scheduled") {
    and.push({ deleteAt: { gt: scope.now } });
  }

  if (filters.availability === "expired") {
    and.push({ deleteAt: { lte: scope.now } });
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

function parseAvailability(value: string) {
  return value === "available" || value === "scheduled" || value === "expired" ? value : "all";
}

function toDateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function historyHref(filters: ReturnType<typeof parseFilters>, page: number) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.company) params.set("company", filters.company);
  if (filters.status) params.set("status", filters.status);
  if (filters.visibility !== "visible") params.set("visibility", filters.visibility);
  if (filters.availability !== "all") params.set("availability", filters.availability);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/certificados/historico?${query}` : "/certificados/historico";
}

function formatSequenceValue(value: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(4, "0");
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
