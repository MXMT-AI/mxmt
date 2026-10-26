"use client";
import ReportTable from "@/components/data-reporting/ReportTable";
import {
  panel,
  button,
  Note,
} from "@/components/merchandising/ReportPrimitives";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { RepricingEdits } from "@/lib/repricing-workspace";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview, RepricingFailure } from "./useRepricingPreview";
import { control } from "@/components/merchandising/FormControls";
import styles from "@/components/merchandising/report.module.css";
type Row = RepricingPreview["rows"][number];
export default function RepricingTable({
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
  const rowError = (row: Row) =>
    !!error &&
    manual.has(row.skuId) &&
    error.details.some(
      (d) =>
        d.startsWith(`manualPrices.${row.skuId}:`) ||
        d.startsWith(
          `manualPrices.${edits.manualPrices.findIndex((e) => e.skuId === row.skuId)}.`,
        ),
    );
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
          const invalid = rowError(row);
          const errorId = `repricing-price-${row.skuId}`;
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
                    className="size-5 accent-[var(--text)]"
                    checked={selection.get(row.skuId) ?? row.selectionRequested}
                    disabled={!row.eligible || !canEdit || !settled}
                    onChange={(e) => onSelection(row.skuId, e.target.checked)}
                  />
                </label>
              );
            case "name":
              return (
                <div className="min-w-52 max-w-72 whitespace-normal break-words">
                  <strong className="font-semibold">{row.name}</strong>{" "}
                  <span
                    className={
                      row.classification === "RISK"
                        ? styles.warning
                        : styles.bad
                    }
                  >
                    {row.classification === "RISK"
                      ? copy.statuses.RISK
                      : copy.statuses.DEAD}
                  </span>
                  <div className="mt-1 text-[var(--muted)]">
                    <span translate="no">
                      {row.brandName ?? copy.unassigned}
                    </span>{" "}
                    · {row.categoryName ?? copy.unassigned}
                    <br />
                    <span translate="no">{row.sku}</span>
                  </div>
                  {row.ownership === "CONSIGNMENT" ? (
                    <p className={styles.warning}>{copy.consignment}</p>
                  ) : !row.eligible ? (
                    <p>{copy.unavailable}</p>
                  ) : null}
                </div>
              );
            case "daysWithoutSale":
              return row.neverSold
                ? copy.neverSold
                : format(row.daysWithoutSale, "number", locale);
            case "effectiveDiscount":
              if (!settled) return "—";
              return (
                <span>
                  {format(row.effectiveDiscount, "percentage", locale)}
                  {row.floorLimited ? (
                    <small
                      className={
                        styles.warning + " block max-w-40 whitespace-normal"
                      }
                    >
                      {copy.floor}
                    </small>
                  ) : null}
                  {row.priceErrors.map((code) => (
                    <small
                      className={
                        styles.bad + " block max-w-40 whitespace-normal"
                      }
                      key={code}
                    >
                      {code === "AUTOMATIC_PRICE_INCREASE"
                        ? copy.priceIncreased
                        : code === "NON_POSITIVE_PRICE"
                          ? copy.nonPositive
                          : code === "COST_FLOOR_VIOLATION"
                            ? copy.costFloor
                            : copy.belowCost}
                    </small>
                  ))}
                </span>
              );
            case "newPrice":
              return (
                <div className="w-36">
                  <input
                    aria-label={`${copy.newPrice}: ${row.name}`}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? errorId : undefined}
                    className={control + " text-right tabular-nums"}
                    name={`price-${row.skuId}`}
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={manual.get(row.skuId) ?? row.newPrice ?? ""}
                    disabled={!row.eligible || !canEdit}
                    onChange={(e) => onPrice(row.skuId, e.target.value)}
                  />
                  {manual.has(row.skuId) ? (
                    <>
                      <small className="block mt-1">{copy.manual}</small>
                      <button
                        type="button"
                        className="min-h-11 text-xs underline underline-offset-2"
                        disabled={!canEdit}
                        onClick={() => onPrice(row.skuId, null)}
                      >
                        {copy.restore}
                      </button>
                    </>
                  ) : null}
                  {invalid ? (
                    <p
                      id={errorId}
                      className={styles.bad + " mt-1 text-xs whitespace-normal"}
                    >
                      {copy.manualError}
                    </p>
                  ) : null}
                </div>
              );
            case "margin":
              if (!settled) return "—";
              return (
                <span
                  className={
                    row.marginTone === "RED"
                      ? styles.bad
                      : row.marginTone === "AMBER"
                        ? styles.warning
                        : row.marginTone === "GREEN"
                          ? styles.good
                          : "text-[var(--muted)]"
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
          className="flex items-center gap-3 border-t border-[var(--border)] p-3 text-xs"
        >
          <button
            className={button}
            type="button"
            disabled={data.pagination.page <= 1 || !settled}
            onClick={() => onPage(data.pagination.page - 1)}
          >
            {copy.previous}
          </button>
          <span>
            {copy.page} {data.pagination.page} /{" "}
            {Math.max(1, data.pagination.totalPages)}
          </span>
          <button
            className={button}
            type="button"
            disabled={
              data.pagination.page >= data.pagination.totalPages || !settled
            }
            onClick={() => onPage(data.pagination.page + 1)}
          >
            {copy.next}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
