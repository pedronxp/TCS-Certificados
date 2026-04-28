import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { CertificateStatus, Prisma } from "@prisma/client";
import { RevokeButton } from "@/components/certificates/revoke-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const pageSize = 25;
const certificateStatuses = ["ISSUED", "REVOKED"] satisfies CertificateStatus[];
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

type HistorySearchParams = Promise<{
  q?: string | string[];
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
  const params = await searchParams;
  const filters = parseFilters(params);
  const where = buildWhere(filters);

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
  const issues = rows.slice(0, pageSize);
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

      <form className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[minmax(18rem,1fr)_10rem_10rem_10rem_auto]">
        <label className="field">
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

        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todos</option>
            <option value="ISSUED">Emitido</option>
            <option value="REVOKED">Revogado</option>
          </select>
        </label>

        <label className="field">
          <span>De</span>
          <input name="from" type="date" defaultValue={filters.from} />
        </label>

        <label className="field">
          <span>Até</span>
          <input name="to" type="date" defaultValue={filters.to} />
        </label>

        <div className="flex items-end gap-2">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
            <Search className="size-4" />
            Filtrar
          </button>
          <Link
            href="/certificados/historico"
            className="inline-grid h-10 w-10 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            title="Limpar filtros"
          >
            <X className="size-4" />
          </Link>
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Titular</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Emissão</th>
                <th className="px-4 py-3">Emissor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{issue.recipient.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[issue.recipient.email, issue.recipient.document].filter(Boolean).join(" · ") ||
                        "Sem contato/documento"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{issue.template.name}</td>
                  <td className="px-4 py-3">
                    <Link className="font-mono text-teal-700 hover:underline" href={`/validar/${issue.verificationCode}`}>
                      {issue.verificationCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{dateFormatter.format(issue.issuedAt)}</td>
                  <td className="px-4 py-3">{issue.issuedBy.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={issue.status} />
                    {issue.revokedAt ? (
                      <p className="mt-1 text-xs text-slate-500">em {dateFormatter.format(issue.revokedAt)}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <a className="rounded bg-slate-100 px-2 py-1 font-semibold hover:bg-slate-200" href={`/api/certificates/${issue.id}/download/pdf`}>PDF</a>
                      <a className="rounded bg-slate-100 px-2 py-1 font-semibold hover:bg-slate-200" href={`/api/certificates/${issue.id}/download/docx`}>DOCX</a>
                      <RevokeButton id={issue.id} disabled={issue.status === "REVOKED"} />
                    </div>
                  </td>
                </tr>
              ))}
              {!issues.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    Nenhum certificado encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
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

function firstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function historyHref(filters: ReturnType<typeof parseFilters>, page: number) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `/certificados/historico?${query}` : "/certificados/historico";
}

function StatusBadge({ status }: { status: CertificateStatus }) {
  if (status === "REVOKED") {
    return (
      <span className="inline-flex rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">
        Revogado
      </span>
    );
  }

  return (
    <span className="inline-flex rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
      Emitido
    </span>
  );
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
