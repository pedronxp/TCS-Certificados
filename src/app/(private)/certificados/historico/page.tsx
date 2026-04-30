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
  const where = buildWhere(filters);
  const canManage = user.role === "ADMIN";

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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Histórico</h1>
          <p className="mt-1 text-sm text-slate-500">
            Consulte certificados emitidos, filtre registros e baixe os arquivos gerados.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm">
          <p className="font-bold text-slate-950">{issues.length}</p>
          <p className="text-slate-500">{issues.length === 1 ? "registro nesta página" : "registros nesta página"}</p>
        </div>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-12">
        <label className="field lg:col-span-5">
          <span>Buscar</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Titular, código, modelo, e-mail ou documento"
              className="pl-9"
            />
          </div>
        </label>

        <label className="field lg:col-span-4">
          <span>Empresa</span>
          <input
            name="company"
            defaultValue={filters.company}
            placeholder="Nome da empresa"
          />
        </label>

        <label className="field lg:col-span-3">
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos</option>
            <option value="ISSUED">Emitido</option>
            <option value="REVOKED">Revogado</option>
          </select>
        </label>

        <label className="field lg:col-span-3">
          <span>De</span>
          <input name="from" type="date" defaultValue={filters.from} />
        </label>

        <label className="field lg:col-span-3">
          <span>Até</span>
          <input name="to" type="date" defaultValue={filters.to} />
        </label>

        <div className="flex items-end gap-2 lg:col-span-3">
          <button className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
            <Search className="size-4" />
            Filtrar
          </button>
          <Link
            href="/certificados/historico"
            className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            title="Limpar filtros"
          >
            <X className="size-4" />
          </Link>
        </div>
      </form>

      <HistoryTable issues={issues} canManage={canManage} />

      <section className="overflow-hidden rounded-b-lg border-x border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
          <p>
            Mostrando {start}-{end}
          </p>
          <div className="flex items-center gap-2">
            <PaginationLink
              href={historyHref(filters, filters.page - 1)}
              disabled={filters.page <= 1}
              label="Página anterior"
              icon="previous"
            />
            <span className="min-w-24 text-center font-medium text-slate-700">
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
  const page = Number.parseInt(firstParam(params.page) || "1", 10);

  return {
    q: firstParam(params.q).trim(),
    company: firstParam(params.company).trim(),
    status: certificateStatuses.includes(status as CertificateStatus) ? (status as CertificateStatus) : undefined,
    from: normalizeDateInput(firstParam(params.from)),
    to: normalizeDateInput(firstParam(params.to)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function buildWhere(filters: ReturnType<typeof parseFilters>): Prisma.CertificateIssueWhereInput {
  const and: Prisma.CertificateIssueWhereInput[] = [];

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
  const company = issueValues.empresa ?? issueValues.company;
  const companyName = String(company ?? "").trim();

  return companyName || "Sem empresa";
}

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function toDateInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function historyHref(filters: ReturnType<typeof parseFilters>, page: number) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.company) params.set("company", filters.company);
  if (filters.status) params.set("status", filters.status);
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
  const className =
    "inline-grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

  if (disabled) {
    return (
      <span className={`${className} cursor-not-allowed opacity-50`} title={label}>
        {icon === "previous" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </span>
    );
  }

  return (
    <Link href={href} className={className} title={label}>
      {icon === "previous" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </Link>
  );
}
