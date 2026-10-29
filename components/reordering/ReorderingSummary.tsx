"use client";
import { useState } from "react";
import ReportTable from "@/components/data-reporting/ReportTable";
import {
  panel,
  button,
  Note,
} from "@/components/merchandising/ReportPrimitives";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ReorderingPreview } from "./ReorderingEditor";
/** Suppress outdated cash claims until the newest server scenario succeeds. */
export default function ReorderingSummary({
  data,
  current,
  copy,
  locale,
  onExport,
  exporting = false,
}: {
  data: ReorderingPreview | null;
  current: boolean;
  copy: ReorderingCopy;
  locale: string;
  onExport?: () => void;
  exporting?: boolean;
}) {
  const result = current ? data : null;
  return (
    <section
      className={panel + " p-5 space-y-4"}
      aria-labelledby="reordering-summary"
      aria-busy={!current}
    >
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="font-semibold" id="reordering-summary">
          {copy.summary}
        </h2>
        <button
          type="button"
          className={button + " disabled:opacity-50"}
          disabled={!onExport || exporting || !current}
          onClick={onExport}
          aria-describedby="reordering-csv-note"
        >
          {copy.csv}
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {[
          [copy.totalUnits, result?.totals.quantity],
          [copy.knownUnits, result?.totals.knownQuantity],
          [copy.shortageCount, result?.counts.shortageSkuCount],
          [copy.reviewCount, result?.counts.reviewSkuCount],
          [copy.offSeasonCount, result?.counts.offSeasonSkuCount],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs text-(--muted)">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {format(value, "quantity", locale)}
            </dd>
          </div>
        ))}
      </dl>
      {result?.currencies.map((currency) => (
        <div
          key={currency.currency ?? "unknown"}
          className="border-t border-(--border) pt-3"
        >
          <strong translate="no">{currency.currency ?? copy.unknown}</strong>
          <p className="mt-1 text-sm">
            {copy.amount}: {format(currency.purchaseAmount, "money", locale)}
          </p>
          {currency.unknownAmountSkuCount > 0 ? (
            <>
              <p className="text-xs">{copy.partial}</p>
              <Note>
                {copy.covered}:{" "}
                {format(currency.coveredPurchaseAmount, "money", locale)}
              </Note>
            </>
          ) : null}
        </div>
      ))}
      <Note>{copy.globalBasis}</Note>
      <p id="reordering-csv-note" className="text-xs text-(--muted)">
        {copy.csvReady}
      </p>
    </section>
  );
}
/** Groups use server totals over the complete scenario, never sums of the visible SKU page. */
export function SupplierGroups({
  data,
  copy,
  locale,
  onExport,
  exporting = false,
}: {
  data: ReorderingPreview;
  copy: ReorderingCopy;
  locale: string;
  onExport?: (supplierId: string, currency: string) => void;
  exporting?: boolean;
}) {
  const [page, setPage] = useState(1);
  const groups = data.suppliers,
    pageSize = 10,
    pages = Math.max(1, Math.ceil(groups.length / pageSize)),
    visible = groups.slice((page - 1) * pageSize, page * pageSize);
  const columns = (
    [
      ["supplierName", copy.supplier, "text"],
      ["currency", copy.currency, "text"],
      ["skuCount", copy.groupRows, "number"],
      ["quantity", copy.groupUnits, "quantity"],
      ["purchaseAmount", copy.amount, "money"],
      ["exportEligibleSkuCount", copy.exportReady, "number"],
      ["csv", copy.csvSupplier, "text"],
    ] as const
  ).map(([key, label, type]) => ({ key, label, type }) as DataColumnMetadata);
  return (
    <section
      className={panel + " overflow-hidden"}
      aria-labelledby="reordering-suppliers"
    >
      <div className="p-5 space-y-2">
        <h2 className="font-semibold" id="reordering-suppliers">
          {copy.suppliers}
        </h2>
        <Note>{copy.supplierNote}</Note>
      </div>
      <ReportTable
        columns={columns}
        rows={visible.map((r) => ({
          ...r,
          id: JSON.stringify([r.supplierId, r.currency]),
        }))}
        locale={locale}
        renderCell={(row, column) =>
          column.key === "supplierName" ? (
            <span translate="no">
              {String(row.supplierName ?? copy.unassigned)}
            </span>
          ) : column.key === "csv" ? (
            <button
              type="button"
              className={button + " disabled:opacity-50"}
              disabled={
                !onExport ||
                exporting ||
                !row.supplierId ||
                !row.currency ||
                Number(row.positiveSkuCount) === 0 ||
                Number(row.unknownQuantitySkuCount) > 0 ||
                row.exportEligibleSkuCount !== row.positiveSkuCount
              }
              onClick={() =>
                onExport?.(String(row.supplierId), String(row.currency))
              }
              aria-label={`${copy.csvSupplier}: ${row.supplierName ?? copy.unassigned}`}
              aria-describedby="reordering-csv-note"
            >
              {copy.csvSupplier}
            </button>
          ) : column.key === "purchaseAmount" && row.unknownAmountSkuCount ? (
            <span>
              {copy.partial}
              <small className="block">
                {copy.covered}:{" "}
                {format(row.coveredPurchaseAmount, "money", locale)}
              </small>
            </span>
          ) : (
            format(row[column.key], column.type, locale)
          )
        }
      />
      {pages > 1 ? (
        <nav
          aria-label={copy.suppliers + " — " + copy.page}
          className="flex items-center gap-3 border-t border-(--border) p-3 text-xs"
        >
          <button
            type="button"
            className={button}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {copy.previous}
          </button>
          <span>
            {copy.page} {page} / {pages}
          </span>
          <button
            type="button"
            className={button}
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {copy.next}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
