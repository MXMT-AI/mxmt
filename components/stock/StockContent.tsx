"use client";
import Link from "next/link";
import StockHistory from "./StockHistory";
import { useId } from "react";
import ReportTable from "@/components/data-reporting/ReportTable";
import {
  panel,
  button,
  Note,
  PartialMarker,
  Pager,
} from "@/components/merchandising/ReportPrimitives";
import type { OverviewResponse } from "@/components/merchandising/useMerchandisingScreen";
import type { StockWorkspaceModel } from "@/lib/merchandising-stock-workspace";
import type { Lang } from "@/lib/translations";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { stockCopy, type StockCopy } from "@/lib/stock-copy";
import { overviewCopy } from "@/lib/overview-copy";
import { stockStatusColors } from "@/lib/merchandising-stock-display";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { formatTableValue as format } from "@/lib/data-reporting-ui";
import styles from "@/components/merchandising/report.module.css";

type Block = StockWorkspaceModel["byCurrency"][number];
type Group = Block["categories"]["rows"][number];
type Href = (values: Record<string, string | null>) => string;
const primary = ["DEAD", "RISK", "HEALTHY"] as const;
const statusName = (copy: StockCopy, status: string) =>
  copy.statuses[status as keyof StockCopy["statuses"]] ?? status;
/** Render exact known values and disclose partial valuation instead of formatting it as zero. */
function Cost({
  value,
  covered,
  locale,
  copy,
}: {
  value: string | null;
  covered?: string;
  locale: string;
  copy: StockCopy;
}) {
  return (
    <>
      {format(value, "money", locale)}
      {value === null ? (
        <>
          <PartialMarker label={copy.partial} />
          {covered !== undefined ? (
            <small className="block text-(--muted)">
              {copy.covered}: {format(covered, "money", locale)}
            </small>
          ) : null}
        </>
      ) : null}
    </>
  );
}
/** Legend links are the keyboard alternative to selecting graphical status segments. */
function QualityRing({
  block,
  selected,
  copy,
  locale,
  href,
}: {
  block: Block;
  selected: string | null;
  copy: StockCopy;
  locale: string;
  href: Href;
}) {
  const titleId = useId(),
    circumference = 2 * Math.PI * 64;
  let offset = 0;
  const active = block.statuses.find((r) => r.status === selected && r.inRing);
  return (
    <div className="space-y-4 p-5">
      <h3 className="font-semibold">K1 · {copy.quality}</h3>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="relative w-48 h-48 shrink-0">
          <svg
            viewBox="0 0 180 180"
            className="w-full h-full"
            role="img"
            aria-labelledby={titleId}
          >
            <title id={titleId}>{copy.quality + " · " + copy.ringBasis}</title>
            <circle
              cx="90"
              cy="90"
              r="64"
              fill="none"
              stroke="var(--border)"
              strokeWidth="30"
            />
            {primary.map((status) => {
              const row = block.statuses.find((r) => r.status === status),
                length = Number(row?.ringShare ?? 0) * circumference,
                start = offset;
              offset += length;
              return (
                <circle
                  key={status}
                  cx="90"
                  cy="90"
                  r="64"
                  fill="none"
                  stroke={stockStatusColors[status]}
                  strokeWidth="30"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 90 90)"
                >
                  <title>{`${statusName(copy, status)}: ${format(row ? row.stockCost : "0", "money", locale)} · ${format(row?.ringShare, "percentage", locale)}`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-10">
            <strong className="text-xl tabular-nums leading-tight wrap-break-word">
              {active
                ? format(active.ringShare, "percentage", locale)
                : format(block.ringCost, "money", locale)}
            </strong>
            <span className="mt-1 text-xs text-(--muted)">
              {active ? statusName(copy, active.status) : copy.cost}
            </span>
            <span className="text-xs mt-1">
              {active ? active.skuCount : block.ringSkuCount} {copy.skus}
            </span>
          </div>
        </div>
        <div className="min-w-0 w-full space-y-2">
          {primary.map((status) => {
            const row = block.statuses.find((r) => r.status === status);
            return (
              <Link
                key={status}
                aria-current={selected === status ? "true" : undefined}
                href={href({
                  classification: selected === status ? null : status,
                  categoryPage: null,
                  brandPage: null,
                  page: null,
                  categorySort: null,
                  categoryDirection: null,
                })}
                className={
                  button +
                  " w-full justify-between gap-2 " +
                  (selected === status
                    ? " bg-(--input-bg) ring-1 ring-(--accent)"
                    : "")
                }
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ background: stockStatusColors[status] }}
                  />
                  {statusName(copy, status)}{" "}
                  <span className="text-xs text-(--muted)">
                    {row?.skuCount ?? 0} {copy.skus}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {format(row ? row.stockCost : "0", "money", locale)}
                  <small className="block text-(--muted)">
                    {format(row?.ringShare, "percentage", locale)}
                  </small>
                </span>
              </Link>
            );
          })}
          <Link
            className={button + " w-full"}
            href={href({
              classification: null,
              categoryPage: null,
              brandPage: null,
              page: null,
              categorySort: null,
              categoryDirection: null,
            })}
          >
            {copy.all}
          </Link>
        </div>
      </div>
      <Note>{copy.ringBasis}</Note>
      {block.ringCost === null ? (
        <p className="text-sm">
          {copy.partial} · {copy.covered}:{" "}
          {format(block.coveredRingCost, "money", locale)}
        </p>
      ) : null}
      <div className="border-t border-(--border) pt-4 space-y-3">
        <h4 className="text-sm font-semibold">{copy.outside}</h4>
        <ul className="space-y-2 text-xs">
          {block.statuses
            .filter((r) => !r.inRing)
            .map((r) => (
              <li key={r.status} className="flex justify-between gap-3">
                <Link
                  className="underline underline-offset-4"
                  href={href({
                    classification: r.status,
                    categoryPage: null,
                    brandPage: null,
                    page: null,
                    categorySort: null,
                    categoryDirection: null,
                  })}
                >
                  {statusName(copy, r.status)} · {r.skuCount} {copy.skus}
                </Link>
                <span className="text-right tabular-nums">
                  {r.status === "SERVICE" ? (
                    format(null, "money", locale)
                  ) : (
                    <Cost
                      value={r.stockCost}
                      covered={
                        r.physicalSkuCount ? r.coveredStockCost : undefined
                      }
                      locale={locale}
                      copy={copy}
                    />
                  )}
                </span>
              </li>
            ))}
        </ul>
        <Note>{copy.outsideBasis}</Note>
      </div>
      <Note>{copy.overviewBasis}</Note>
      <Note>
        {copy.gray}: {format(block.grayCost, "money", locale)}
      </Note>
    </div>
  );
}
/** A category bar uses the full category's monetary denominator, including the gray remainder. */
function Structure({
  row,
  copy,
  locale,
}: {
  row: Group;
  copy: StockCopy;
  locale: string;
}) {
  const label = row.statuses
    .filter((s) => s.skuCount > 0)
    .map(
      (s) =>
        `${statusName(copy, s.status)} ${format(s.share, "percentage", locale)}`,
    )
    .join(", ");
  return (
    <span
      role="img"
      aria-label={label || copy.empty}
      className="block h-2 w-36 rounded-sm overflow-hidden bg-(--input-bg)"
    >
      {row.statuses
        .filter((s) => s.share !== null && s.share !== "0")
        .map((s) => (
          <span
            key={s.status}
            aria-hidden="true"
            className="inline-block h-full align-top"
            style={{
              width: `${Number(s.share) * 100}%`,
              background: stockStatusColors[s.status],
            }}
          />
        ))}
    </span>
  );
}
/** K1–K4 preserve the saved calculation and expose SKU/action navigation without running actions. */
export default function StockContent({
  data,
  lang,
  query,
  onRefresh,
  onNavigate,
}: {
  data: OverviewResponse;
  lang: Lang;
  query: string;
  onRefresh?: () => void;
  onNavigate?: (href: string) => void;
}) {
  const model = data.stockWorkspace,
    copy = stockCopy[lang],
    locale = lang === "uk" ? "uk-UA" : "en-US";
  if (!model) return null;
  const params = new URLSearchParams(query);
  params.set("snapshotId", data.context.snapshotId);
  params.set("dateFrom", data.context.period.from);
  params.set("dateTo", data.context.period.to);
  const href: Href = (values) =>
    merchandisingHref("/stock", params, {
      ...Object.fromEntries(
        [
          "groupBy",
          "classification",
          "ownership",
          "supplierId",
          "page",
          "sort",
          "direction",
          "categoryPage",
          "brandPage",
          "categorySort",
          "categoryDirection",
        ]
          .filter((k) => params.has(k))
          .map((k) => [k, params.get(k)]),
      ),
      ...values,
    });
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "Europe/Kyiv",
    }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
  const columns: DataColumnMetadata[] = [
    { key: "name", label: copy.name, type: "text" },
    ...primary.map((key) => ({
      key,
      label: statusName(copy, key),
      type: "money" as const,
    })),
    { key: "OTHER", label: copy.other, type: "money" },
    { key: "stockCost", label: copy.total, type: "money" },
    { key: "structure", label: copy.structure, type: "text" },
  ];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm text-(--muted)">
            {copy.snapshot}: {date(model.asOf)} · {copy.allChannels}
          </p>
          <p className="mt-1 text-xs text-(--muted)">
            {copy.cutoff}:{" "}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Kyiv",
            }).format(new Date(model.cutoff))}
          </p>
        </div>
        {onRefresh ? (
          <button type="button" className={button} onClick={onRefresh}>
            {copy.refresh}
          </button>
        ) : null}
      </header>
      <Note>
        {
          {
            FRESH: overviewCopy[lang].fresh,
            STALE: overviewCopy[lang].stale,
            HISTORICAL: overviewCopy[lang].historical,
            SYNCING: overviewCopy[lang].syncing,
            SOURCE_CHANGED: overviewCopy[lang].changed,
            SOURCE_UNAVAILABLE: overviewCopy[lang].sourceUnavailable,
          }[data.freshness.status]
        }
      </Note>
      {params.has("brandId") ||
      params.has("categoryId") ||
      params.has("skuId") ||
      params.has("currency") ? (
        <Link
          className="inline-block underline underline-offset-4 text-sm"
          href={href({
            brandId: null,
            categoryId: null,
            skuId: null,
            currency: null,
            groupBy: "category",
            page: null,
            categoryPage: null,
            brandPage: null,
          })}
        >
          {copy.clearDrill}
        </Link>
      ) : null}
      {!model.classificationAvailable ? (
        <p role="status" className="text-sm">
          {copy.legacy}
        </p>
      ) : null}
      {model.byCurrency.length === 0 ? <p role="status">{copy.empty}</p> : null}
      {model.byCurrency.map((block) => {
        const scoped: Href = (values) =>
          href({ currency: block.currency ?? "__unassigned__", ...values });
        return (
          <section
            key={block.currency ?? "unknown"}
            className="space-y-5"
            aria-label={block.currency ?? copy.unassigned}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-(--border) pb-3">
              <h2 className="text-lg font-bold">
                {block.currency ?? (lang === "uk" ? "Без підтвердженої валюти / залишку" : "Unverified currency / stock")}
              </h2>
              {block.currency === null ? <Note>{lang === "uk" ? "Окрема група без підтвердженої валюти або залишку на дату знімка. Тут можуть бути історичні товари, відсутні в останньому каталозі. Невідомий залишок не означає нуль." : "Separate records without verified currency or stock on the snapshot date. These may include historical products absent from the latest catalogue. Unknown stock does not mean zero."}</Note> : null}
              <div className="text-sm tabular-nums">
                {copy.fullStock}:{" "}
                <strong>
                  <Cost
                    value={block.stockCost}
                    covered={block.coveredStockCost}
                    locale={locale}
                    copy={copy}
                  />
                </strong>
                <span className="ml-3 text-(--muted)">
                  {copy.quantity}: {format(block.quantity, "quantity", locale)}
                </span>
              </div>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <section className={panel}>
                {model.classificationAvailable ? (
                  <QualityRing
                    block={block}
                    selected={model.selectedStatus}
                    copy={copy}
                    locale={locale}
                    href={scoped}
                  />
                ) : (
                  <p className="p-5">{copy.legacy}</p>
                )}
              </section>
              <section className={panel + " p-5 flex flex-col self-start min-w-0"}>
                <h3 className="font-semibold">K2 · {copy.history}</h3>
                <StockHistory history={model.history} currency={block.currency} lang={lang}/>
              </section>
            </div>
            <section className={panel}>
              <div className="p-5 space-y-2">
                <h3 className="font-semibold">K3 · {copy.categories}</h3>
                <Note>{copy.categoryBasis}</Note>
                <Note>
                  {copy.sortBy}:{" "}
                  {model.categorySort === "name"
                    ? copy.name
                    : model.categorySort === "stockCost"
                      ? copy.total
                      : model.categorySort === "OTHER"
                        ? copy.other
                        : statusName(copy, model.categorySort)}{" "}
                  {model.categoryDirection === "desc" ? "↓" : "↑"}
                </Note>
                {model.selectedStatus ? <Note>{copy.groupFilter}</Note> : null}
              </div>
              <ReportTable
                columns={columns}
                rows={block.categories.rows.map((r) => ({
                  ...r,
                  id: r.id ?? "__unassigned__",
                  source: r,
                  ...Object.fromEntries(
                    primary.map((s) => [
                      s,
                      r.statuses.find((c) => c.status === s)?.stockCost ?? null,
                    ]),
                  ),
                  OTHER: r.otherCost,
                }))}
                locale={locale}
                sortColumn={model.categorySort}
                direction={model.categoryDirection}
                isSortable={(col) =>
                  Boolean(onNavigate) && col.key !== "structure"
                }
                onSort={(col) =>
                  onNavigate?.(
                    scoped({
                      categorySort: col.key,
                      categoryDirection:
                        model.categorySort === col.key &&
                        model.categoryDirection === "desc"
                          ? "asc"
                          : "desc",
                      categoryPage: null,
                    }),
                  )
                }
                renderCell={(row, col) => {
                  const r = row.source as Group;
                  if (col.key === "name")
                    return (
                      <Link
                        className="underline underline-offset-4"
                        href={scoped({
                          categoryId: r.id ?? "__unassigned__",
                          groupBy: "sku",
                          page: null,
                        })}
                      >
                        {r.id === null ? copy.unassigned : r.name}
                      </Link>
                    );
                  if (col.key === "structure")
                    return <Structure row={r} copy={copy} locale={locale} />;
                  const status = r.statuses.find((s) => s.status === col.key);
                  return (
                    <Link
                      className="underline underline-offset-4"
                      href={scoped({
                        categoryId: r.id ?? "__unassigned__",
                        groupBy: "sku",
                        classification: status
                          ? status.status
                          : col.key === "OTHER"
                            ? null
                            : model.selectedStatus,
                        page: null,
                      })}
                    >
                      <Cost
                        value={row[col.key] as string | null}
                        covered={
                          col.key === "stockCost"
                            ? r.coveredStockCost
                            : status?.coveredStockCost
                        }
                        locale={locale}
                        copy={copy}
                      />
                    </Link>
                  );
                }}
              />
              {!block.categories.rows.length ? (
                <p className="p-5 text-sm text-(--muted)">{copy.empty}</p>
              ) : null}
              <Pager
                pagination={block.categories.pagination}
                control="categoryPage"
                href={scoped}
                copy={copy}
              />
            </section>
            {!model.monobrand && (
              <section className={panel}>
                <div className="p-5 space-y-2">
                  <h3 className="font-semibold">K4 · {copy.brands}</h3>
                  <Note>{copy.brandBasis}</Note>
                  {model.selectedStatus ? (
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
                  rows={block.brands.rows.map((r) => ({
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
                              ? styles.bad
                              : r.signal === "RISK"
                                ? styles.warning
                                : r.signal === "HEALTHY"
                                  ? styles.good
                                  : r.signal === "NEW" ||
                                      r.signal === "OFF_SEASON"
                                    ? styles.info
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
                        <Cost
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
                {!block.brands.rows.length ? (
                  <p className="p-5 text-sm text-(--muted)">
                    {copy.empty}
                  </p>
                ) : null}
                <Pager
                  pagination={block.brands.pagination}
                  control="brandPage"
                  href={scoped}
                  copy={copy}
                />
              </section>
            )}{" "}
            <Link
              className={button}
              href={scoped({ groupBy: "sku", page: null })}
            >
              {copy.allSkus}
            </Link>
          </section>
        );
      })}
      {model.showSkus && data.table ? (
        <section className={panel}>
          <div className="p-5 space-y-2">
            <h2 className="font-semibold">
              {copy.skus} · {copy.allChannels}
            </h2>
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
            rows={data.table.rows}
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
                const details = row.details as Record<string, unknown> | null,
                  ids = {
                    skuId: String(row.id),
                    currency:
                      row.currency === null
                        ? "__unassigned__"
                        : String(row.currency),
                    brandId: model.monobrand
                      ? null
                      : details?.brandId === null
                        ? "__unassigned__"
                        : String(details?.brandId ?? "__unassigned__"),
                    classification: null,
                    mode: model.monobrand ? "all" : "brand",
                  };
                return (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className={button}
                      href={merchandisingHref("/repricing", params, {
                        ...ids,
                        mode: null,
                        classification: ["DEAD", "RISK"].includes(
                          String(row.classification),
                        )
                          ? String(row.classification)
                          : null,
                      })}
                    >
                      {copy.repricing}
                    </Link>
                    <Link
                      className={button}
                      href={merchandisingHref("/reordering", params, ids)}
                    >
                      {copy.reordering}
                    </Link>
                  </div>
                );
              }
              return (
                <>
                  {format(row[col.key], col.type, locale)}
                  {col.key === "sellThroughRatio" && !row.strComplete ? (
                    <PartialMarker label={copy.strPartial} />
                  ) : null}
                </>
              );
            }}
          />
          <Pager
            pagination={data.table.pagination}
            control="page"
            href={href}
            copy={copy}
          />
          {!data.table.rows.length ? (
            <p className="p-5 text-sm">{copy.empty}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
