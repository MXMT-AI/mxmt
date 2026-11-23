"use client";
import { Link } from "@/i18n/navigation";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { button } from "@/components/ui/button/button-styles";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Note } from "@/components/ui/note/note";
import { ReportTableFooter } from "@/components/data-reporting/report-table/report-table-footer";
import type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";
import type { StockCopy } from "@/lib/stock-copy";
import { stockStatusLabel as statusName } from "@/lib/merchandising-stock-display";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import type { Href } from "../stock-content/stock-content-types";
import { StockMetricCell } from "../stock-metric-cell/stock-metric-cell";
import { stockSkuLinks } from "./stock-sku-links";

const skuActions = ["repricing", "reordering"] as const;

export function StockSkuTable({ table, monobrand, params, href, copy, locale }: {
  table: NonNullable<OverviewResponse["table"]>;
  monobrand: boolean;
  params: URLSearchParams;
  href: Href;
  copy: StockCopy;
  locale: string;
}) {
  const formatValue = createTableValueFormatter(locale);
  return (
    <section className={panel}>
      <div className="p-5 space-y-2">
        <Heading as="h2" variant="compact" className="text-base text-inherit">
          {copy.skus} · {copy.allChannels}
        </Heading>
        <Note>{copy.actions}</Note>
      </div>
      <ReportTable
        locale={locale}
        columns={[
          { key: "name", label: copy.name, type: "text" },
          { key: "classification", label: copy.status, type: "text" },
          { key: "quantity", label: copy.quantity, type: "quantity" },
          { key: "stockCost", label: copy.cost, type: "money" },
          { key: "weeksOnHand", label: copy.woh, type: "number" },
          { key: "sellThroughRatio", label: copy.str, type: "percentage" },
          { key: "actions", label: copy.actionsColumn, type: "text" },
        ]}
        rows={table.rows}
        renderCell={(row, col) => {
          if (col.key === "classification")
            return statusName(
              copy,
              String(row.classification ?? "DATA_ERROR"),
            );
          if (col.key === "name")
            return (
              <span>
                {String(row.name ?? row.sku)}
                <small className="block text-(--muted)">
                  {String(row.sku ?? "")}
                </small>
              </span>
            );
          if (col.key === "actions") {
            const links = stockSkuLinks(row, params, monobrand);
            return (
              <div className="flex flex-wrap gap-2">
                {skuActions.map(action => (
                  <Link key={action} className={button} href={links[action]}>{copy[action]}</Link>
                ))}
              </div>
            );
          }
          return (
            <StockMetricCell row={row} column={col} formatValue={formatValue} partialLabel={copy.strPartial} />
          );
        }}
      />
      <ReportTableFooter
        pagination={table.pagination}
        control="page"
        href={href}
        copy={copy}
        rowCount={table.rows.length}
        emptyAfterPager
        emptyState={
          <Text variant="body" className="p-5 leading-normal text-inherit">{copy.empty}</Text>
        }
      />
    </section>
  );
}
