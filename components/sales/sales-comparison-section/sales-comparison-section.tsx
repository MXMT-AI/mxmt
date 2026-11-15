import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Note } from "@/components/ui/note/note";
import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { SalesCopy } from "@/lib/sales-copy";
import type { SalesWorkspaceModel } from "@/lib/merchandising-sales-workspace";
import type { SalesCurrencyBlock, SalesHref } from "../sales-types";
import { salesTone } from "../sales-tone";

type ComparisonRow = SalesCurrencyBlock["comparison"]["rows"][number];

export function SalesComparisonSection({ comparison, period, history, oneOffAvailable, group, units, copy, locale, href }: {
  comparison: SalesCurrencyBlock["comparison"];
  period: SalesWorkspaceModel["period"];
  history: SalesWorkspaceModel["history"];
  oneOffAvailable: boolean;
  group: SalesWorkspaceModel["groupBy"];
  units: boolean;
  copy: SalesCopy;
  locale: string;
  href: SalesHref;
}) {
  const lyRows = [
    ...comparison.rows.map((r) => ({
      ...r,
      id: r.id ?? "__unassigned__",
      source: r,
    })),
    ...(comparison.total
      ? [
          {
            ...comparison.total,
            id: "__total__",
            name: copy.total,
            source: null,
          },
        ]
      : []),
  ];
  return (
    <section className={panel}>
      <div className="space-y-2 p-5">
        <Heading as="h3" variant="compact" className="text-base text-inherit">S4 · {copy.comparison}</Heading>
        <Note>{copy.comparisonScope}</Note>
        <Note>
          {copy.current}: {period.from} — {period.to} · LY:{" "}
          {period.lyFrom} — {period.lyTo}
        </Note>
        {!comparison.available ? (
          <p role="status" className="text-sm">
            {history.current && history.ly
              ? copy.partial
              : copy.noLy}
          </p>
        ) : !comparison.rows.length ? (
          <Note>{copy.noChanges}</Note>
        ) : null}
        {!oneOffAvailable ? <Note>{copy.noOutliers}</Note> : null}
      </div>
      <ReportTable
        locale={locale}
        columns={[
          { key: "name", label: copy.name, type: "text" },
          {
            key: "current",
            label: units ? copy.units : copy.revenue,
            type: units ? "quantity" : "money",
          },
          {
            key: "ly",
            label: copy.ly,
            type: units ? "quantity" : "money",
          },
          {
            key: "delta",
            label: copy.delta,
            type: units ? "quantity" : "money",
          },
          { key: "changePct", label: copy.change, type: "percentage" },
        ]}
        rows={lyRows}
        renderCell={(row, col) => {
            const source = row.source as ComparisonRow | null;
          if (col.key === "name")
            return source ? (
              <>
                <Link
                  href={href({
                    groupBy: "sku",
                    [`${group}Id`]: String(row.id),
                    page: null,
                    others: null,
                  })}
                  className="underline underline-offset-4"
                >
                  {source.id === null
                    ? copy.unassigned
                    : String(row.name)}
                </Link>
                {source.oneOffLy ? (
                  <span className="mt-1 block max-w-56 text-xs text-(--muted)">
                    {copy.oneOff}
                  </span>
                ) : null}
              </>
            ) : (
              <strong>{copy.total}</strong>
            );
          const signed = col.key === "delta" || col.key === "changePct";
          return (
            <span className={signed ? salesTone(String(row.tone)) : ""}>
              {signed &&
              row.tone === "GREEN" &&
              row[col.key] !== null &&
              row[col.key] !== undefined &&
              row[col.key] !== ""
                ? "+"
                : ""}
              {formatTableValue(row[col.key], col.type, locale)}
              {(col.key === "current" && row.currentPartial) ||
              (col.key === "ly" && row.lyPartial) ? (
                <PartialMarker label={copy.partial} />
              ) : null}
            </span>
          );
        }}
      />
    </section>
  );
}
