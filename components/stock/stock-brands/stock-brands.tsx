"use client";
import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { Pager } from "@/components/ui/pager/pager";
import { StockCost } from "../stock-cost/stock-cost";
import type { StockCopy } from "@/lib/stock-copy";
import type { Block, Group, Href } from "../stock-content/stock-content-types";
import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import { formatTableValue as format } from "@/lib/data-reporting-ui";

export function StockBrands({ groups, selectedStatus, copy, locale, href: scoped, date }: {
  groups: Block["brands"];
  selectedStatus: string | null;
  copy: StockCopy;
  locale: string;
  href: Href;
  date: (value: string) => string;
}) {
  return (
    <section className={panel}>
      <div className="p-5 space-y-2">
        <Heading as="h3" variant="compact" className="text-base text-inherit">K4 · {copy.brands}</Heading>
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
          if (col.key === "signal")
            return (
              <span
                className={
                  r.signal === "DEAD"
                    ? "text-report-negative"
                    : r.signal === "RISK"
                      ? "text-report-warning"
                      : r.signal === "HEALTHY"
                        ? "text-report-positive"
                        : r.signal === "NEW" ||
                            r.signal === "OFF_SEASON"
                          ? "text-report-info"
                          : "text-(--muted)"
                }
              >
                {copy.signals[
                  r.signal as keyof StockCopy["signals"]
                ] ?? copy.signals.UNAVAILABLE}
                {r.signal === "NEW" && r.firstReceiptDate ? (
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
          if (col.key === "stockCost")
            return (
              <StockCost
                value={r.stockCost}
                covered={r.coveredStockCost}
                locale={locale}
                copy={copy}
              />
            );
          return (
            <>
              {format(row[col.key], col.type, locale)}
              {col.key === "sellThroughRatio" && !r.strComplete ? (
                <PartialMarker label={copy.strPartial} />
              ) : null}
            </>
          );
        }}
      />
      {!groups.rows.length ? (
        <Text variant="body" className="leading-normal text-base text-inherit p-5 text-sm text-(--muted)">
          {copy.empty}
        </Text>
      ) : null}
      <Pager
        pagination={groups.pagination}
        control="brandPage"
        href={scoped}
        copy={copy}
      />
    </section>
  );
}
