"use client";
import { Heading } from "@/components/ui/heading/heading";
import { useState } from "react";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ReorderingPreview } from "../reordering-editor/reordering-editor";
export function ReorderingSupplierGroups({
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
        <Heading as="h2" variant="compact" className="text-base text-inherit" id="reordering-suppliers">
          {copy.suppliers}
        </Heading>
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
            <Button
              variant="report"
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
            </Button>
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
          <Button
              variant="report"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {copy.previous}
          </Button>
          <span>
            {copy.page} {page} / {pages}
          </span>
          <Button
              variant="report"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {copy.next}
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
