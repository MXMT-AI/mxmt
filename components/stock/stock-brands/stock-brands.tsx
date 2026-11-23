"use client";
import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { ReportTableFooter } from "@/components/data-reporting/report-table/report-table-footer";
import { StockCost } from "../stock-cost/stock-cost";
import type { StockCopy } from "@/lib/stock-copy";
import type { Block, Group, Href } from "../stock-content/stock-content-types";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import { StockMetricCell } from "../stock-metric-cell/stock-metric-cell";
import { stockStockBrandsMessages as englishCopy } from "@/messages/en.json";

const signalClass: Partial<Record<NonNullable<Group["signal"]>, string>> = {
  DEAD: "text-report-negative",
  RISK: "text-report-warning",
  HEALTHY: "text-report-positive",
  NEW: "text-report-info",
  OFF_SEASON: "text-report-info",
};

export function StockBrands({ groups, selectedStatus, copy, locale, href: scoped, date }: {
  groups: Block["brands"];
  selectedStatus: string | null;
  copy: StockCopy;
  locale: string;
  href: Href;
  date: (value: string) => string;
}) {
  const formatValue = createTableValueFormatter(locale);
  return (
    <section className={panel}>
      <div className="p-5 space-y-2">
        <Heading as="h3" variant="compact" className="text-base text-inherit">{englishCopy.k4}{copy.brands}</Heading>
        <Note>{copy.brandBasis}</Note>
        {selectedStatus ? (
          <Note>{copy.groupFilter}</Note>
        ) : null}
      </div>
      <ReportTable
        locale={locale}
        columns={[
          { key: "name", label: copy.name, type: "text" },
          { key: "stockCost", label: copy.cost, type: "money" },
          { key: "quantity", label: copy.quantity, type: "quantity" },
          {
            key: "sellThroughRatio",
            label: copy.str,
            type: "percentage",
          },
          { key: "weeksOnHand", label: copy.woh, type: "number" },
          { key: "signal", label: copy.signal, type: "text" },
        ]}
        rows={groups.rows.map((r) => ({
          ...r,
          id: r.id ?? "__unassigned__",
          source: r,
        }))}
        renderCell={(row, col) => {
          const r = row.source as Group;
          if (col.key === "name")
            return (
              <Link
                className="underline underline-offset-4"
                href={scoped({
                  brandId: r.id ?? "__unassigned__",
                  groupBy: "sku",
                  page: null,
                })}
              >
                {r.id === null ? copy.unassigned : r.name}
              </Link>
            );
          if (col.key === "signal") {
            const signal = r.signal ?? "UNAVAILABLE";
            return (
              <span className={signalClass[signal] ?? "text-(--muted)"}>
                {copy.signals[signal as keyof StockCopy["signals"]] ?? copy.signals.UNAVAILABLE}
                {signal === "NEW" && r.firstReceiptDate ? (
                  <small className="block">
                    {copy.firstReceipt}: {date(r.firstReceiptDate)}
                  </small>
                ) : null}
                {r.warnings.length ? (
                  <small className="block mt-1 text-(--muted)">
                    {copy.ownershipUnknown}
                  </small>
                ) : null}
              </span>
            );
          }
          if (col.key === "stockCost")
            return (
              <StockCost
                value={r.stockCost}
                covered={r.coveredStockCost}
                formatValue={formatValue}
                copy={copy}
              />
            );
          return (
            <StockMetricCell row={row} column={col} formatValue={formatValue} partialLabel={copy.strPartial} />
          );
        }}
      />
      <ReportTableFooter
        pagination={groups.pagination}
        control="brandPage"
        href={scoped}
        copy={copy}
        rowCount={groups.rows.length}
        emptyState={
          <Text variant="body" className="p-5 leading-normal text-(--muted)">
            {copy.empty}
          </Text>
        }
      />
    </section>
  );
}
