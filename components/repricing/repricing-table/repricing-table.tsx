"use client";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { RepricingEdits } from "@/lib/repricing-workspace";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview, RepricingFailure } from "../use-repricing-preview";
import { RepricingProductCell } from "../repricing-product-cell/repricing-product-cell";
import { RepricingDiscountCell } from "../repricing-discount-cell/repricing-discount-cell";
import { RepricingPriceCell } from "../repricing-price-cell/repricing-price-cell";
type Row = RepricingPreview["rows"][number];
export default function RepricingTable({
  monobrand = false,
  data,
  edits,
  copy,
  locale,
  canEdit,
  settled,
  error,
  onSelection,
  onPrice,
  onPage,
}: {
  monobrand?: boolean;
  data: RepricingPreview;
  edits: RepricingEdits;
  copy: RepricingCopy;
  locale: string;
  canEdit: boolean;
  settled: boolean;
  error: RepricingFailure | null;
  onSelection: (skuId: string, included: boolean) => void;
  onPrice: (skuId: string, price: string | null) => void;
  onPage: (page: number) => void;
}) {
  const columns = (
    [
      ["include", copy.include, "text"],
      ["name", copy.product, "text"],
      ["quantity", copy.quantity, "quantity"],
      [
        "soldUnits",
        copy.sold + " " + data.filters.soldMonths + " " + copy.months,
        "quantity",
      ],
      ["unitCost", copy.cost, "money"],
      ["currentPrice", copy.currentPrice, "money"],
      ["daysWithoutSale", copy.age, "number"],
      ["effectiveDiscount", copy.discount, "percentage"],
      ["newPrice", copy.newPrice, "money"],
      ["margin", copy.margin, "percentage"],
    ] as const
  ).map(([key, label, type]) => ({ key, label, type }) as DataColumnMetadata);
  const manual = new Map(edits.manualPrices.map((r) => [r.skuId, r.price])),
    selection = new Map(edits.selection.map((r) => [r.skuId, r.included]));
  const invalidSkus = new Set<string>();
  for (const detail of error?.details ?? []) {
    const indexed = /^manualPrices\.(\d+)\./.exec(detail);
    const bySku = /^manualPrices\.([^:]+):/.exec(detail);
    const skuId = indexed
      ? edits.manualPrices[Number(indexed[1])]?.skuId
      : bySku?.[1];
    if (skuId !== undefined && manual.has(skuId)) invalidSkus.add(skuId);
  }
  return (
    <section
      className={panel + " overflow-hidden"}
      aria-label={copy.product}
      aria-busy={!settled}
    >
      <div className="px-5 py-3">
        <Note>
          {copy.currencyNote} {copy.eligible}: {data.counts.eligibleSkuCount}.{" "}
          {copy.selected}: {data.counts.selectedSkuCount}.
        </Note>
      </div>
      <ReportTable
        columns={columns}
        rows={data.rows.map((r) => ({ ...r, id: r.skuId }))}
        locale={locale}
        getCellStyle={(r) => ({
          ...(r.marginTone === "RED"
            ? { backgroundColor: "rgba(239,68,68,0.09)" }
            : {}),
          ...(!r.selected ? { color: "var(--muted)" } : {}),
        })}
        renderCell={(raw, column) => {
          const row = raw as Row;
          switch (column.key) {
            case "include":
              return (
                <label className="flex min-h-11 min-w-11 items-center justify-center">
                  <span className="sr-only">
                    {copy.include}: {row.name}
                  </span>
                  <input
                    type="checkbox"
                    name={`include-${row.skuId}`}
                    className="size-5 accent-(--text)"
                    checked={selection.get(row.skuId) ?? row.selectionRequested}
                    disabled={!row.eligible || !canEdit || !settled}
                    onChange={(e) => onSelection(row.skuId, e.target.checked)}
                  />
                </label>
              );
            case "name":
              return <RepricingProductCell row={row} copy={copy} monobrand={monobrand} />;
            case "daysWithoutSale":
              return row.neverSold
                ? copy.neverSold
                : format(row.daysWithoutSale, "number", locale);
            case "effectiveDiscount":
              return <RepricingDiscountCell row={row} copy={copy} locale={locale} settled={settled} />;
            case "newPrice":
              return (
                <RepricingPriceCell
                  row={row}
                  value={manual.get(row.skuId)}
                  edited={manual.has(row.skuId)}
                  invalid={invalidSkus.has(row.skuId)}
                  copy={copy}
                  canEdit={canEdit}
                  onPrice={onPrice}
                />
              );
            case "margin":
              if (!settled) return "—";
              return (
                <span
                  className={
                    row.marginTone === "RED"
                      ? "text-report-negative"
                      : row.marginTone === "AMBER"
                        ? "text-report-warning"
                        : row.marginTone === "GREEN"
                          ? "text-report-positive"
                          : "text-(--muted)"
                  }
                >
                  {format(row.margin, "percentage", locale)}
                </span>
              );
            default:
              return format(raw[column.key], column.type, locale);
          }
        }}
      />
      {!data.rows.length ? <p className="p-5 text-sm">{copy.empty}</p> : null}
      {data.pagination.totalPages > 1 || data.pagination.page > 1 ? (
        <nav
          aria-label={copy.page}
          className="flex items-center gap-3 border-t border-(--border) p-3 text-xs"
        >
          <Button
            variant="report"
            disabled={data.pagination.page <= 1 || !settled}
            onClick={() => onPage(data.pagination.page - 1)}
          >
            {copy.previous}
          </Button>
          <span>
            {copy.page} {data.pagination.page} /{" "}
            {Math.max(1, data.pagination.totalPages)}
          </span>
          <Button
            variant="report"
            disabled={
              data.pagination.page >= data.pagination.totalPages || !settled
            }
            onClick={() => onPage(data.pagination.page + 1)}
          >
            {copy.next}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
