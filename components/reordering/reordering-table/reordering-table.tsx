"use client";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ScenarioFailure } from "@/lib/client/scenario-preview-request";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { ReorderingPreview } from "../reordering-editor/reordering-editor";
import { ReorderingTransitCell } from "../reordering-transit-cell/reordering-transit-cell";
import { ReorderingNotesCell } from "../reordering-notes-cell/reordering-notes-cell";

type Row = ReorderingPreview["rows"][number];
export default function ReorderingTable({
  monobrand = false,
  data,
  copy,
  locale,
  current,
  transit,
  error,
  onTransit,
  onRestore,
  onPage,
}: {
  monobrand?: boolean;
  data: ReorderingPreview;
  copy: ReorderingCopy;
  locale: string;
  current: boolean;
  transit: Record<string, string>;
  error: ScenarioFailure | null;
  onTransit: (skuId: string, value: string) => void;
  onRestore: (skuId: string) => void;
  onPage: (page: number) => void;
}) {
  const columns = (
    [
      ["name", copy.product, "text"],
      ["quantity", copy.stock, "quantity"],
      ["velocityPerWeek", copy.velocity, "quantity"],
      ["daysToZero", copy.daysToZero, "number"],
      ["inTransitQuantity", copy.transit, "quantity"],
      ["recommendedQuantity", copy.recommended, "quantity"],
      ["purchaseAmount", copy.amount, "money"],
      ["notes", copy.notes, "text"],
    ] as const
  ).map(([key, label, type]) => ({ key, label, type }) as DataColumnMetadata);
  const overrideIds = Object.keys(transit)
    .filter((id) => transit[id] !== "")
    .sort();
  const overrideIndices = new Map(overrideIds.map((skuId, index) => [skuId, index]));
  const invalidOverrideIndices = new Set<number>();
  for (const detail of error?.details ?? []) {
    const match = /^overrides\.(\d+)\.inTransitQuantity/.exec(detail);
    if (match) invalidOverrideIndices.add(Number(match[1]));
  }
  return (
    <section
      className={panel + " overflow-hidden"}
      aria-label={copy.product}
      aria-busy={!current}
    >
      <div className="px-5 py-3">
        <Note>{copy.zeroHint}</Note>
      </div>
      <ReportTable
        columns={columns}
        rows={data.rows.map((row) => ({ ...row, id: row.skuId }))}
        locale={locale}
        getCellStyle={(r) =>
          r.state === "EXCLUDED"
            ? { color: "var(--muted)", backgroundColor: "var(--input-bg)" }
            : r.urgency === "RED"
              ? { backgroundColor: "rgba(239,68,68,0.08)" }
              : undefined
        }
        renderCell={(raw, column) => {
          const row = raw as Row;
          switch (column.key) {
            case "name":
              return (
                <div className="min-w-48 max-w-72 whitespace-normal wrap-break-word">
                  <strong className="font-semibold">{row.name}</strong>
                  <p className="mt-1 text-(--muted)">
                    {!monobrand && (
                      <>
                        <span translate="no">
                          {row.brandName ?? copy.unassigned}
                        </span>{" "}
                        ·{" "}
                      </>
                    )}
                    {row.categoryName ?? copy.unassigned}
                  </p>
                  <p translate="no">
                    {copy.sku}: {row.sku}
                  </p>
                  <p translate="no">
                    {copy.barcode}: {row.barcode ?? "—"}
                  </p>
                </div>
              );
            case "inTransitQuantity":
              return (
                <ReorderingTransitCell
                  row={row}
                  value={transit[row.skuId]}
                  edited={Object.hasOwn(transit, row.skuId)}
                  invalid={invalidOverrideIndices.has(overrideIndices.get(row.skuId) ?? -1)}
                  copy={copy}
                  onTransit={onTransit}
                  onRestore={onRestore}
                />
              );
            case "daysToZero":
              return (
                <span
                  className={row.urgency === "RED" ? "text-report-negative" : undefined}
                >
                  {format(row.daysToZero, "number", locale)}
                </span>
              );
            case "recommendedQuantity":
              return (
                <strong>
                  {current
                    ? format(row.recommendedQuantity, "quantity", locale)
                    : "—"}
                </strong>
              );
            case "purchaseAmount":
              return current ? (
                <span>
                  {format(row.purchaseAmount, "money", locale)}
                  <small className="block" translate="no">
                    {row.currency ?? copy.unknown}
                  </small>
                </span>
              ) : (
                "—"
              );
            case "notes":
              return <ReorderingNotesCell row={row} copy={copy} />;
            default:
              return format(raw[column.key], column.type, locale);
          }
        }}
      />
      {!data.rows.length ? <p className="p-5 text-sm">{copy.empty}</p> : null}
      {data.pagination.totalPages > 1 || data.pagination.page > 1 ? (
        <nav
          className="flex items-center gap-3 border-t border-(--border) p-3 text-xs"
          aria-label={copy.page}
        >
          <Button
            variant="report"
            disabled={!current || data.pagination.page <= 1}
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
              !current || data.pagination.page >= data.pagination.totalPages
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
