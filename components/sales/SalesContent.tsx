"use client";
import { Link } from "@/i18n/navigation";
import {
  panel,
  button,
  Note,
  PartialMarker,
  Pager,
} from "@/components/merchandising/ReportPrimitives";
import { useId } from "react";
import ReportTable from "@/components/data-reporting/ReportTable";
import type { OverviewResponse } from "@/components/merchandising/useMerchandisingScreen";
import type {
  SalesCell,
  SalesWorkspaceModel,
} from "@/lib/merchandising-sales-workspace";
import type { Lang } from "@/lib/translations";
import type { DataColumnMetadata } from "@/lib/data-table-api";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { formatTableValue } from "@/lib/data-reporting-ui";
import { overviewCopy } from "@/lib/overview-copy";
import { salesCopy, type SalesCopy } from "@/lib/sales-copy";
import styles from "@/components/merchandising/report.module.css";

type Block = SalesWorkspaceModel["byCurrency"][number];
type MatrixRow = Block["matrix"]["rows"][number];
type Href = (values: Record<string, string | null>) => string;
/** Map server comparison tones to the shared theme-aware semantic colors. */
const tone = (value: string) =>
  value === "GREEN" ? styles.good : value === "RED" ? styles.bad : "";
/** Format server monthly cells and retain currency-scoped SKU drill links. */
function Matrix({
  rows,
  total,
  metric,
  group,
  copy,
  locale,
  href,
}: {
  rows: MatrixRow[];
  total?: MatrixRow | null;
  metric: SalesWorkspaceModel["metric"];
  group: SalesWorkspaceModel["groupBy"];
  copy: SalesCopy;
  locale: string;
  href: Href;
}) {
  const months = (total ?? rows[0])?.cells.map((c) => c.month) ?? [];
  const type: DataColumnMetadata["type"] =
    metric === "gmPct"
      ? "percentage"
      : metric === "units"
        ? "quantity"
        : "money";
  const columns: DataColumnMetadata[] = [
    { key: "name", label: copy.name, type: "text" },
    ...months.map((m) => ({
      key: m,
      label: new Intl.DateTimeFormat(locale, {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(m + "-01T12:00:00Z")),
      type,
    })),
    { key: "total", label: copy.total, type },
  ];
  if (!rows.length && !total)
    return <p className="p-5 text-sm text-(--muted)">{copy.noRows}</p>;
  const tableRows = [...rows, ...(total ? [total] : [])].map((r) => ({
    id: r.kind + ":" + (r.id ?? "null"),
    name: r.name,
    total: r.total,
    currency: r.currency,
    source: r,
    ...Object.fromEntries(r.cells.map((c) => [c.month, c])),
  }));
  return (
    <ReportTable
      columns={columns}
      rows={tableRows}
      locale={locale}
      getCellStyle={(row, col) => {
        if (col.key === "name") return undefined;
        const c = row[col.key] as SalesCell;
        return {
          backgroundColor:
            c.alpha !== null
              ? `rgba(${c.tone === "GREEN" ? "34, 145, 84" : c.tone === "RED" ? "210, 70, 65" : "77, 131, 170"}, ${c.alpha})`
              : undefined,
          fontWeight:
            (row.source as MatrixRow).kind === "TOTAL" ? 700 : undefined,
        };
      }}
      renderCell={(row, col) => {
        const r = row.source as MatrixRow;
        if (col.key === "name") {
          const label =
            r.kind === "TOTAL"
              ? copy.total
              : r.kind === "OTHERS"
                ? copy.others
                : r.id === null
                  ? copy.unassigned
                  : r.name;
          if (r.kind === "TOTAL") return <strong>{label}</strong>;
          if (r.kind === "OTHERS")
            return (
              <Link
                className="underline underline-offset-4"
                href={href({ groupBy: group, others: "1", page: null })}
              >
                {label} ({r.groupCount})
              </Link>
            );
          return (
            <Link
              className="underline underline-offset-4"
              href={href({
                groupBy: "sku",
                [`${group}Id`]: r.id ?? "__unassigned__",
                currency: r.currency ?? "__unassigned__",
                others: null,
                page: null,
              })}
            >
              {label}
            </Link>
          );
        }
        const c = row[col.key] as SalesCell;
        return (
          <span
            className={tone(c.tone)}
            title={c.partial ? copy.partial : undefined}
          >
            {formatTableValue(c.value, col.type, locale)}
            {c.partial ? <PartialMarker label={copy.partial} /> : null}
          </span>
        );
      }}
    />
  );
}
const categoryColors = ["#779ab5", "#87a88c", "#c4a36e", "#a08eb5", "#9a9ea4"];
/** Only chart coordinates use numbers; accessible values retain the server decimal strings. */
function CategoryChart({
  rows,
  locale,
  copy,
  units,
  href,
}: {
  rows: Block["categories"];
  locale: string;
  copy: SalesCopy;
  units: boolean;
  href: Href;
}) {
  const titleId = useId(),
    groups = rows
      .filter((r) => r.kind !== "TOTAL")
      .sort((a, b) =>
        a.kind === "OTHERS" ? 1 : b.kind === "OTHERS" ? -1 : a.rank - b.rank,
      ),
    total = rows.find((r) => r.kind === "TOTAL"),
    months = (total ?? groups[0])?.cells.map((c) => c.month) ?? [];
  const extents = months.map((_, i) =>
    groups.reduce(
      (a, r) => {
        const n = Number(r.cells[i].value ?? 0);
        return {
          positive: a.positive + Math.max(n, 0),
          negative: a.negative + Math.min(n, 0),
        };
      },
      { positive: 0, negative: 0 },
    ),
  );
  const max = Math.max(1, ...extents.map((e) => e.positive)),
    min = Math.min(0, ...extents.map((e) => e.negative)),
    height = 100,
    scale = height / (max - min),
    baseline = max * scale;
  return (
    <figure className="p-5 space-y-4">
      <figcaption className="text-xs text-(--muted)">
        {units ? copy.units : copy.revenue} · {copy.chartScope}
      </figcaption>
      {groups.some((r) => r.cells.some((c) => c.partial)) ? (
        <Note>{copy.partial}</Note>
      ) : null}
      {months.length ? (
        <svg
          className="w-full h-44"
          viewBox={`0 -4 ${Math.max(1, months.length) * 28} 125`}
          role="img"
          aria-labelledby={titleId}
        >
          <title
            id={titleId}
          >{`${copy.categories} — ${units ? copy.units : copy.revenue}`}</title>
          <line
            x1="0"
            x2={months.length * 28}
            y1={baseline}
            y2={baseline}
            stroke="var(--border)"
          />
          {months.map((month, i) => {
            let positive = 0,
              negative = 0;
            return (
              <g key={month}>
                {groups.map((r, j) => {
                  const n = Number(r.cells[i].value ?? 0),
                    top =
                      n >= 0
                        ? baseline - (positive + n) * scale
                        : baseline - negative * scale;
                  if (n >= 0) positive += n;
                  else negative += n;
                  return r.cells[i].value === null ? null : (
                    <rect
                      key={r.kind + ":" + r.id}
                      x={i * 28 + 5}
                      y={top}
                      width="18"
                      height={Math.abs(n) * scale}
                      fill={categoryColors[j]}
                    >
                      <title>{`${r.kind === "OTHERS" ? copy.others : r.name} · ${month}: ${formatTableValue(r.cells[i].value, units ? "quantity" : "money", locale)}`}</title>
                    </rect>
                  );
                })}
                <text
                  x={i * 28 + 14}
                  y="117"
                  textAnchor="middle"
                  fontSize="8"
                  fill="var(--muted)"
                >
                  {new Intl.DateTimeFormat(locale, {
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(month + "-01T12:00:00Z"))}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <p>{copy.noRows}</p>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {groups.map((r, i) => (
          <li key={r.kind + ":" + r.id} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-xs"
              style={{ background: categoryColors[i] }}
            />
            {r.kind === "OTHERS" ? (
              copy.others
            ) : (
              <Link
                className="underline underline-offset-4"
                href={href({
                  categoryId: r.id ?? "__unassigned__",
                  groupBy: "sku",
                  others: null,
                  page: null,
                })}
              >
                {r.id === null ? copy.unassigned : r.name}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer py-2 text-sm underline underline-offset-4">
          {copy.details}
        </summary>
        <Matrix
          rows={groups}
          total={total}
          metric={units ? "units" : "revenue"}
          group="category"
          copy={copy}
          locale={locale}
          href={href}
        />
      </details>
    </figure>
  );
}
/** Present S1–S4 from one pinned response without deriving financial totals. */
export default function SalesContent({
  data,
  lang,
  query,
  onRefresh,
}: {
  data: OverviewResponse;
  lang: Lang;
  query: string;
  onRefresh?: () => void;
}) {
  const model = data.workspace,
    copy = salesCopy[lang],
    locale = lang === "uk" ? "uk-UA" : "en-GB";
  if (!model) return null;
  const params = new URLSearchParams(query);
  params.set("snapshotId", data.context.snapshotId);
  params.set("dateFrom", data.context.period.from);
  params.set("dateTo", data.context.period.to);
  const href: Href = (values) =>
    merchandisingHref("/sales", params, {
      ...(params.has("page") ? { page: params.get("page") } : {}),
      ...(params.has("channelPage")
        ? { channelPage: params.get("channelPage") }
        : {}),
      ...values,
    });
  const group = model.groupBy,
    units = model.measure === "units",
    mono = model.monobrand;
  const allHref = href({
    brandId: null,
    categoryId: null,
    skuId: null,
    currency: null,
    groupBy: mono ? "category" : "brand",
    others: null,
    page: null,
    channelPage: null,
  });
  const controls = (
    label: string,
    values: Array<{ key: string; label: string }>,
    value: string,
    field: string,
  ) => (
    <div className="space-y-1.5">
      <p className="text-xs text-(--muted)">{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {values.map((v) => (
          <Link
            key={v.key}
            href={href({
              [field]: v.key,
              page: null,
              others: null,
              channelPage: null,
              ...(field === "measure" && v.key === "units"
                ? { metric: "revenue" }
                : {}),
            })}
            aria-current={value === v.key ? "true" : undefined}
            className={
              button +
              (value === v.key
                ? " bg-(--accent) text-[#002a24] font-semibold"
                : "")
            }
          >
            {v.label}
          </Link>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap justify-between gap-4 items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-sm text-(--muted)">
            {copy.scope}: {model.period.from} — {model.period.to}
          </p>
          <p className="mt-1 text-xs text-(--muted) break-all">
            {copy.snapshot}:{" "}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Kyiv",
            }).format(new Date(data.context.createdAt))}
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
      <div className="flex flex-wrap gap-5 items-end">
        {controls(
          copy.group,
          [
            ...(!mono ? [{ key: "brand", label: copy.brand }] : []),
            { key: "category", label: copy.category },
            { key: "sku", label: copy.sku },
          ],
          group,
          "groupBy",
        )}
        {controls(
          copy.measure,
          [
            { key: "money", label: copy.money },
            { key: "units", label: copy.units },
          ],
          model.measure,
          "measure",
        )}
        <div className="space-y-1.5">
          <p className="text-xs text-(--muted)">{copy.metric}</p>
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label={copy.metric}
          >
            {(["revenue", "coveredGrossProfit", "gmPct"] as const).map((m) =>
              units ? (
                <button
                  key={m}
                  type="button"
                  disabled
                  title={copy.financialDisabled}
                  className={
                    button + " disabled:opacity-50 disabled:cursor-not-allowed"
                  }
                >
                  {copy[m]}
                </button>
              ) : (
                <Link
                  key={m}
                  href={href({ metric: m, page: null })}
                  aria-current={model.metric === m ? "true" : undefined}
                  className={
                    button +
                    (model.metric === m
                      ? " bg-(--accent) text-[#002a24] font-semibold"
                      : "")
                  }
                >
                  {copy[m]}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>
      {["brandId", "categoryId", "skuId", "currency"].some((k) =>
        params.has(k),
      ) ? (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          {copy.filtered}{" "}
          <Link className="underline underline-offset-4" href={allHref}>
            {copy.all}
          </Link>
        </p>
      ) : null}
      {data.dataState === "EMPTY" ? (
        <p
          role="status"
          className="rounded-lg border border-(--border) p-4 text-sm"
        >
          {copy.empty}
        </p>
      ) : null}
      {!model.yearHistoryAvailable ? <Note>{copy.fallback}</Note> : null}
      {!model.monthlyAvailable ? <Note>{copy.legacy}</Note> : null}
      {model.byCurrency.map((block) => {
        const scopedHref: Href = (values) =>
            href({ currency: block.currency ?? "__unassigned__", ...values }),
          summary = data.sales?.summary.find(
            (s) => s.currency === block.currency,
          ),
          comparison = block.comparison;
        const lyRows = [
          ...comparison.rows.map((r) => ({
            ...r,
            id: r.id ?? "__unassigned__",
            source: r,
          })),
          ...(comparison.total
            ? [
                {
                  ...comparison.total,
                  id: "__total__",
                  name: copy.total,
                  source: null,
                },
              ]
            : []),
        ];
        return (
          <section
            key={block.currency ?? "unknown"}
            aria-label={block.currency ?? copy.unassigned}
            className="space-y-5"
          >
            <div className="flex flex-wrap justify-between gap-3 items-baseline border-b border-(--border) pb-3">
              <h2 className="text-lg font-bold">
                {block.currency ?? copy.unassigned}
              </h2>
              {summary ? (
                <p className="text-xs text-(--muted)">
                  {copy.orders}:{" "}
                  <strong className="text-(--text)">
                    {formatTableValue(
                      summary.current.orderCount,
                      "number",
                      locale,
                    )}
                  </strong>{" "}
                  · {copy.qty}:{" "}
                  <strong className="text-(--text)">
                    {formatTableValue(
                      model.history.current ? summary.current.units : null,
                      "quantity",
                      locale,
                    )}
                  </strong>
                </p>
              ) : null}
            </div>
            <section className={panel}>
              <div className="space-y-2 p-5 border-b border-(--border)">
                <h3 className="font-semibold">S1 · {copy.monthly}</h3>
                <Note>
                  {copy.tableScope}: {model.tablePeriod.from} —{" "}
                  {model.tablePeriod.to}
                </Note>
                <Note>
                  {group === "sku" ? copy.sku : copy.ranking} ·{" "}
                  {model.metric === "gmPct" ? copy.marginBasis : copy.heat}
                </Note>
                <Note>* {copy.partial}</Note>
              </div>
              <Matrix
                rows={block.matrix.rows}
                total={block.matrix.total}
                metric={model.metric}
                group={group}
                copy={copy}
                locale={locale}
                href={scopedHref}
              />
              {group === "sku" ? (
                <Pager
                  pagination={block.matrix.pagination}
                  control="page"
                  href={scopedHref}
                  copy={copy}
                />
              ) : block.matrix.rows.some((r) => r.kind === "OTHERS") ? (
                <div className="p-3 border-t border-(--border)">
                  <Link
                    className={button}
                    href={scopedHref({
                      others: params.has("others") ? null : "1",
                      page: null,
                    })}
                  >
                    {params.has("others") ? copy.hideOthers : copy.showOthers}
                  </Link>
                </div>
              ) : null}
              {group !== "sku" &&
              params.has("others") &&
              block.matrix.rows.some((r) => r.kind === "OTHERS") ? (
                <div className="border-t border-(--border)">
                  <h4 className="p-4 text-sm font-semibold">{copy.others}</h4>
                  <Matrix
                    rows={block.matrix.otherRows}
                    metric={model.metric}
                    group={group}
                    copy={copy}
                    locale={locale}
                    href={scopedHref}
                  />
                  <Pager
                    pagination={block.matrix.pagination}
                    control="page"
                    href={scopedHref}
                    copy={copy}
                  />
                </div>
              ) : null}
            </section>
            <div className="grid gap-5 xl:grid-cols-2">
              <section className={panel}>
                <div className="p-5 space-y-2">
                  <h3 className="font-semibold">S2 · {copy.channels}</h3>
                  <Note>{copy.channelScope}</Note>
                </div>
                <ReportTable
                  locale={locale}
                  columns={[
                    { key: "name", label: copy.name, type: "text" },
                    { key: "revenue", label: copy.revenue, type: "money" },
                    { key: "share", label: copy.share, type: "percentage" },
                  ]}
                  rows={block.channels.rows.map((r) => ({
                    ...r,
                    id: r.id ?? "__unassigned__",
                    revenue: r.total.value,
                    source: r,
                  }))}
                  renderCell={(row, col) =>
                    col.key === "name" ? (
                      <Link
                        className="underline underline-offset-4"
                        href={scopedHref({
                          channelId:
                            (row.source as MatrixRow).id ?? "__unassigned__",
                          page: null,
                          channelPage: null,
                          others: null,
                        })}
                      >
                        {(row.source as MatrixRow).id === null
                          ? copy.unassigned
                          : String(row.name)}
                      </Link>
                    ) : (
                      <span
                        title={
                          (row.source as MatrixRow).total.partial
                            ? copy.partial
                            : undefined
                        }
                      >
                        {formatTableValue(row[col.key], col.type, locale)}
                        {col.key === "revenue" &&
                        (row.source as MatrixRow).total.partial ? (
                          <PartialMarker label={copy.partial} />
                        ) : null}
                      </span>
                    )
                  }
                />
                {!block.channels.rows.length ? (
                  <p className="p-5 text-sm text-(--muted)">
                    {copy.noRows}
                  </p>
                ) : null}
                <Pager
                  pagination={block.channels.pagination}
                  control="channelPage"
                  href={scopedHref}
                  copy={copy}
                />
              </section>
              <section className={panel}>
                <h3 className="px-5 pt-5 font-semibold">
                  S3 · {copy.categories}
                </h3>
                <CategoryChart
                  rows={block.categories}
                  locale={locale}
                  copy={copy}
                  units={units}
                  href={scopedHref}
                />
              </section>
            </div>
            <section className={panel}>
              <div className="space-y-2 p-5">
                <h3 className="font-semibold">S4 · {copy.comparison}</h3>
                <Note>{copy.comparisonScope}</Note>
                <Note>
                  {copy.current}: {model.period.from} — {model.period.to} · LY:{" "}
                  {model.period.lyFrom} — {model.period.lyTo}
                </Note>
                {!comparison.available ? (
                  <p role="status" className="text-sm">
                    {model.history.current && model.history.ly
                      ? copy.partial
                      : copy.noLy}
                  </p>
                ) : !comparison.rows.length ? (
                  <Note>{copy.noChanges}</Note>
                ) : null}
                {!model.oneOffAvailable ? <Note>{copy.noOutliers}</Note> : null}
              </div>
              <ReportTable
                locale={locale}
                columns={[
                  { key: "name", label: copy.name, type: "text" },
                  {
                    key: "current",
                    label: units ? copy.units : copy.revenue,
                    type: units ? "quantity" : "money",
                  },
                  {
                    key: "ly",
                    label: copy.ly,
                    type: units ? "quantity" : "money",
                  },
                  {
                    key: "delta",
                    label: copy.delta,
                    type: units ? "quantity" : "money",
                  },
                  { key: "changePct", label: copy.change, type: "percentage" },
                ]}
                rows={lyRows}
                renderCell={(row, col) => {
                  if (col.key === "name")
                    return row.source ? (
                      <>
                        <Link
                          href={scopedHref({
                            groupBy: "sku",
                            [`${group}Id`]: String(row.id),
                            page: null,
                            others: null,
                          })}
                          className="underline underline-offset-4"
                        >
                          {(row.source as { id: string | null }).id === null
                            ? copy.unassigned
                            : String(row.name)}
                        </Link>
                        {(row.source as { oneOffLy: boolean }).oneOffLy ? (
                          <span className="mt-1 block max-w-56 text-xs text-(--muted)">
                            {copy.oneOff}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <strong>{copy.total}</strong>
                    );
                  const signed = col.key === "delta" || col.key === "changePct";
                  return (
                    <span className={signed ? tone(String(row.tone)) : ""}>
                      {signed &&
                      row.tone === "GREEN" &&
                      row[col.key] !== null &&
                      row[col.key] !== undefined &&
                      row[col.key] !== ""
                        ? "+"
                        : ""}
                      {formatTableValue(row[col.key], col.type, locale)}
                      {(col.key === "current" && row.currentPartial) ||
                      (col.key === "ly" && row.lyPartial) ? (
                        <PartialMarker label={copy.partial} />
                      ) : null}
                    </span>
                  );
                }}
              />
            </section>
          </section>
        );
      })}
    </div>
  );
}
