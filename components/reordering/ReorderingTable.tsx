"use client";
import ReportTable from "@/components/data-reporting/ReportTable";
import {
  panel,
  button,
  Note,
} from "@/components/merchandising/ReportPrimitives";
import { control } from "@/components/merchandising/FormControls";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import { reorderingIssue, type ReorderingCopy } from "@/lib/reordering-copy";
import type { ScenarioFailure } from "@/components/merchandising/useScenarioPreview";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import type { ReorderingPreview } from "./ReorderingEditor";
import styles from "@/components/merchandising/report.module.css";
type Row = ReorderingPreview["rows"][number];
/** Render frozen server recommendations and transient confirmations without deriving order quantities. */
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
            case "inTransitQuantity": {
              const editable = row.shortageEligible && row.state !== "EXCLUDED";
              const edited = Object.hasOwn(transit, row.skuId);
              const invalid = !!error?.details.some((d) =>
                d.startsWith(
                  `overrides.${overrideIds.indexOf(row.skuId)}.inTransitQuantity`,
                ),
              );
              const id = `transit-error-${row.skuId}`;
              return (
                <div className="w-40 space-y-1">
                  <input
                    className={control + " text-right tabular-nums"}
                    aria-label={`${copy.transit}: ${row.name}`}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? id : undefined}
                    name={`transit-${row.skuId}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={transit[row.skuId] ?? row.inTransitQuantity ?? ""}
                    placeholder={copy.unknown + "…"}
                    disabled={!editable}
                    onChange={(e) => onTransit(row.skuId, e.target.value)}
                  />
                  {edited ? (
                    <>
                      <small className="block whitespace-normal">
                        {transit[row.skuId] === ""
                          ? copy.clearedTransit
                          : copy.confirmed}
                      </small>
                      <button
                        className="min-h-11 text-xs underline underline-offset-2"
                        type="button"
                        onClick={() => onRestore(row.skuId)}
                      >
                        {copy.restore}
                      </button>
                    </>
                  ) : row.inTransitQuantity === null && editable ? (
                    <button
                      className={button + " text-xs"}
                      type="button"
                      onClick={() => onTransit(row.skuId, "0")}
                    >
                      {copy.confirmZero}
                    </button>
                  ) : null}
                  {invalid ? (
                    <p
                      id={id}
                      className={styles.bad + " text-xs whitespace-normal"}
                    >
                      {copy.transitError}
                    </p>
                  ) : null}
                </div>
              );
            }
            case "daysToZero":
              return (
                <span
                  className={row.urgency === "RED" ? styles.bad : undefined}
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
            case "notes": {
              const exclusions = row.exclusionReasons.map((r) =>
                r === "OFF_SEASON"
                  ? copy.offSeason
                  : r === "NEW_PRODUCT_QUARANTINE"
                    ? copy.new
                    : r === "INACTIVE"
                      ? copy.inactive
                      : copy.service,
              );
              return (
                <div className="min-w-48 max-w-80 space-y-1 whitespace-normal wrap-break-word">
                  {row.urgency === "RED" ? (
                    <p className={styles.bad}>{copy.urgent}</p>
                  ) : null}
                  {exclusions.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                  {row.issues.length ? (
                    <details>
                      <summary className="min-h-11 cursor-pointer py-2">
                        {copy.review} ({row.issues.length})
                      </summary>
                      {row.issues.map((code) => (
                        <p key={code}>{reorderingIssue(copy, code)}</p>
                      ))}
                    </details>
                  ) : null}
                  {row.state === "ZERO_DEMAND" ? <p>{copy.noDemand}</p> : null}
                  {row.warnings.includes("RECEIPT_DATE_VELOCITY_FALLBACK") ? (
                    <p>{copy.fallback}</p>
                  ) : null}
                  <Note>
                    {copy.terms}: {row.leadDays ?? "—"} / {row.coverDays ?? "—"}{" "}
                    {copy.days} · {copy.moq}: {row.moq ?? "—"}
                  </Note>
                </div>
              );
            }
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
          <button
            type="button"
            className={button}
            disabled={!current || data.pagination.page <= 1}
            onClick={() => onPage(data.pagination.page - 1)}
          >
            {copy.previous}
          </button>
          <span>
            {copy.page} {data.pagination.page} /{" "}
            {Math.max(1, data.pagination.totalPages)}
          </span>
          <button
            type="button"
            className={button}
            disabled={
              !current || data.pagination.page >= data.pagination.totalPages
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
