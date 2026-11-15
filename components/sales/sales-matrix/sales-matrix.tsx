import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import type { SalesCell, SalesWorkspaceModel } from "@/lib/merchandising-sales-workspace";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesMatrixRow, SalesHref } from "../sales-types";
import { salesTone } from "../sales-tone";

export function SalesMatrix({
  rows,
  total,
  metric,
  group,
  copy,
  locale,
  href,
}: {
  rows: SalesMatrixRow[];
  total?: SalesMatrixRow | null;
  metric: SalesWorkspaceModel["metric"];
  group: SalesWorkspaceModel["groupBy"];
  copy: SalesCopy;
  locale: string;
  href: SalesHref;
}) {
  const months = (total ?? rows[0])?.cells.map((c) => c.month) ?? [];
  const type: DataColumnMetadata["type"] =
    metric === "gmPct"
      ? "percentage"
      : metric === "units"
        ? "quantity"
        : "money";
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  const columns: DataColumnMetadata[] = [
    { key: "name", label: copy.name, type: "text" },
    ...months.map((m) => ({
      key: m,
      label: monthFormatter.format(new Date(m + "-01T12:00:00Z")),
      type,
    })),
    { key: "total", label: copy.total, type },
  ];
  if (!rows.length && !total)
    return <p className="p-5 text-sm text-(--muted)">{copy.noRows}</p>;
  const tableRows = [...rows, ...(total ? [total] : [])].map((r) => ({
    id: r.kind + ":" + (r.id ?? "null"),
    name: r.name,
    total: r.total,
    currency: r.currency,
    source: r,
    ...Object.fromEntries(r.cells.map((c) => [c.month, c])),
  }));
  return (
    <ReportTable
      columns={columns}
      rows={tableRows}
      locale={locale}
      getCellStyle={(row, col) => {
        if (col.key === "name") return undefined;
        const c = row[col.key] as SalesCell;
        return {
          backgroundColor:
            c.alpha !== null
              ? `rgba(${c.tone === "GREEN" ? "34, 145, 84" : c.tone === "RED" ? "210, 70, 65" : "77, 131, 170"}, ${c.alpha})`
              : undefined,
          fontWeight:
            (row.source as SalesMatrixRow).kind === "TOTAL" ? 700 : undefined,
        };
      }}
      renderCell={(row, col) => {
        const r = row.source as SalesMatrixRow;
        if (col.key === "name") {
          const label =
            r.kind === "TOTAL"
              ? copy.total
              : r.kind === "OTHERS"
                ? copy.others
                : r.id === null
                  ? copy.unassigned
                  : r.name;
          if (r.kind === "TOTAL") return <strong>{label}</strong>;
          if (r.kind === "OTHERS")
            return (
              <Link
                className="underline underline-offset-4"
                href={href({ groupBy: group, others: "1", page: null })}
              >
                {label} ({r.groupCount})
              </Link>
            );
          return (
            <Link
              className="underline underline-offset-4"
              href={href({
                groupBy: "sku",
                [`${group}Id`]: r.id ?? "__unassigned__",
                currency: r.currency ?? "__unassigned__",
                others: null,
                page: null,
              })}
            >
              {label}
            </Link>
          );
        }
        const c = row[col.key] as SalesCell;
        return (
          <span
            className={salesTone(c.tone)}
            title={c.partial ? copy.partial : undefined}
          >
            {formatTableValue(c.value, col.type, locale)}
            {c.partial ? <PartialMarker label={copy.partial} /> : null}
          </span>
        );
      }}
    />
  );
}
