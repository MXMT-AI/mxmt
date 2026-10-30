"use client";
import { Link } from "@/i18n/navigation";
import { stockStatusColors as statusColors } from "@/lib/merchandising-stock-display";
import { useId, type ReactNode } from "react";
import type { Lang } from "@/lib/translations";
import { overviewCopy, type OverviewCopy } from "@/lib/overview-copy";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { formatTableValue } from "@/lib/data-reporting-ui";
import type { OverviewResponse } from "./useOverview";
import type { OverviewModel } from "@/lib/merchandising-overview";
import styles from "@/components/merchandising/report.module.css";

type CurrencyBlock = OverviewModel["byCurrency"][number];
const panel = "rounded-xl border border-(--border) bg-(--surface)";
const button =
  "inline-flex min-h-11 items-center rounded-lg border border-(--border) px-4 py-2 text-sm font-medium hover:bg-(--input-bg) touch-manipulation";
const tone = (value: string) =>
  value === "GREEN"
    ? styles.good
    : value === "AMBER"
      ? styles.warning
      : value === "RED"
        ? styles.bad
        : "text-(--muted)";
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
function Metric({
  title,
  href,
  children,
  footer,
}: {
  title: string;
  href: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <article className={panel + " min-w-0"}>
      <Link
        href={href}
        className="block rounded-xl p-5 md:p-6 hover:bg-(--input-bg)"
      >
        <div className="mb-4 flex justify-between items-baseline gap-3">
          <h3 className="font-semibold">{title}</h3>
          <span aria-hidden="true">↗</span>
        </div>
        {children}
      </Link>
      {footer ? (
        <div className="border-t border-(--border) px-5 py-3 text-xs md:px-6">
          {footer}
        </div>
      ) : null}
    </article>
  );
}
function Small({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-xs leading-relaxed text-(--muted)">
      {children}
    </p>
  );
}
function Value({ children }: { children: ReactNode }) {
  return (
    <p className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums wrap-break-word">
      {children}
    </p>
  );
}

/** Paired bars only position server values; accessible table retains exact/null amounts. */
function Trend({
  rows,
  history,
  locale,
  money,
  copy,
}: {
  rows: NonNullable<CurrencyBlock["trend"]>;
  history: CurrencyBlock["trendHistory"];
  locale: string;
  money: (v: string | null) => string;
  copy: OverviewCopy;
}) {
  const titleId = useId();
  const hasNegative = rows.some(
    (r) => Number(r.current.revenue ?? 0) < 0 || Number(r.ly.revenue ?? 0) < 0,
  );
  const baseline = hasNegative ? 50 : 80;
  const maxHeight = hasNegative ? 38 : 65;
  const max = Math.max(
    1,
    ...rows.flatMap((r) => [
      Math.abs(Number(r.current.revenue ?? 0)),
      Math.abs(Number(r.ly.revenue ?? 0)),
    ]),
  );
  return (
    <figure className="mt-5">
      <figcaption className="text-xs text-(--muted)">
        {copy.trend} · {rows[0]?.month.slice(0, 4)}
      </figcaption>
      <svg
        viewBox={`0 0 ${rows.length * 26} 100`}
        role="img"
        aria-labelledby={titleId}
        className="mt-2 w-full max-h-28 overflow-visible"
      >
        <title id={titleId}>{`${copy.currentYear} / ${copy.priorYear}`}</title>
        <line
          x1="0"
          x2={rows.length * 26}
          y1={baseline}
          y2={baseline}
          stroke="var(--border)"
        />
        {rows.map((r, i) => (
          <g key={r.month}>
            {[
              { value: r.ly.revenue, x: i * 26 + 3, fill: "var(--muted)" },
              {
                value: r.current.revenue,
                x: i * 26 + 13,
                fill: i === rows.length - 1 ? "var(--accent)" : "#7594b0",
              },
            ].map((bar) => {
              if (bar.value === null) return null;
              const value = Number(bar.value),
                height = (Math.abs(value) / max) * maxHeight;
              return (
                <rect
                  key={bar.x}
                  x={bar.x}
                  y={value < 0 ? baseline : baseline - height}
                  width="8"
                  height={height}
                  fill={bar.fill}
                >
                  <title>{`${r.month}: ${money(bar.value)}`}</title>
                </rect>
              );
            })}
            <text
              x={i * 26 + 12}
              y="98"
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted)"
            >
              {new Intl.DateTimeFormat(locale, {
                month: "short",
                timeZone: "UTC",
              }).format(new Date(r.month + "-01T12:00:00Z"))}
            </text>
          </g>
        ))}
      </svg>
      <Small>
        {copy.currentYear} / {copy.priorYear}
      </Small>
      {!history?.current ||
      !history?.ly ||
      rows.some(
        (r) =>
          r.current.missingRevenueCount > 0 || r.ly.missingRevenueCount > 0,
      ) ? (
        <Small>{copy.historyPartial}</Small>
      ) : null}
      <div className="sr-only">
        <table>
          <caption>{copy.trend}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.month}</th>
              <th scope="col">{copy.currentYear}</th>
              <th scope="col">{copy.priorYear}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <th scope="row">{r.month}</th>
                <td>{money(r.current.revenue)}</td>
                <td>{money(r.ly.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Render only API values and server-decided thresholds, with one currency per panel. */
export default function OverviewContent({
  data,
  lang,
  query,
  monobrand,
  onRefresh,
}: {
  data: OverviewResponse;
  lang: Lang;
  query: string;
  monobrand: boolean;
  onRefresh?: () => void;
}) {
  const copy = overviewCopy[lang],
    locale = lang === "uk" ? "uk-UA" : "en-GB";
  const params = new URLSearchParams(query);
  params.set("snapshotId", data.context.snapshotId);
  params.set("dateFrom", data.context.period.from);
  params.set("dateTo", data.context.period.to);
  if (!params.has("period")) params.set("period", "custom");
  const href = (path: string, detail?: Record<string, string | null>) =>
    merchandisingHref(path, params, detail);
  const date = (s: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(s + "T12:00:00Z"));
  const stamp = (s: string | null) =>
    s
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: data.context.timezone,
        }).format(new Date(s))
      : copy.unavailable;
  const freshness = {
    FRESH: copy.fresh,
    HISTORICAL: copy.historical,
    STALE: copy.stale,
    SOURCE_CHANGED: copy.changed,
    SYNCING: copy.syncing,
    SOURCE_UNAVAILABLE: copy.sourceUnavailable,
  };
  const view = data.overview;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-xs text-(--muted)">
            {data.freshness.freshnessBasis === "SHEETS_IMPORT"
              ? copy.sheetsImported
              : copy.observed}: {stamp(data.freshness.sourceObservedAt)}
          </p>
          <h1 className="mt-2 text-2xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-(--muted)">
            {copy.snapshot}: {date(data.context.asOf)} · {copy.allChannels}
          </p>
          <p className="mt-1 text-xs text-(--muted)">
            {freshness[data.freshness.status as keyof typeof freshness]}
            {data.freshness.historical && data.freshness.sourceStale
              ? ` · ${copy.stale}`
              : ""}
          </p>
        </div>
        {onRefresh ? (
          <button type="button" className={button} onClick={onRefresh}>
            {copy.refresh}
          </button>
        ) : null}
      </header>
      {(data.sales?.issues.length ?? 0) > 0 ||
      (data.stock?.issues.length ?? 0) > 0 ? (
        <div
          role="status"
          className={
            panel +
            " flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs"
          }
        >
          <p className="font-medium">{copy.partial}</p>
          <Small>
            {copy.diagnostics}:{" "}
            {
              [...(data.sales?.issues ?? []), ...(data.stock?.issues ?? [])]
                .length
            }
          </Small>
          <Link
            href={href("/settings")}
            className="inline-block min-h-8 py-2 underline underline-offset-4"
          >
            {copy.settings}
          </Link>
        </div>
      ) : null}
      {data.dataState === "EMPTY" ? (
        <section className={panel + " p-6"}>
          <h2 className="font-semibold">{copy.empty}</h2>
          <Small>{copy.emptyHint}</Small>
          <Link className={button + " mt-4"} href={href("/settings")}>
            {copy.settings}
          </Link>
        </section>
      ) : null}
      {view && view.byCurrency.length > 1 ? (
        <p className="text-sm text-(--muted)">{copy.currencies}</p>
      ) : null}
      {view?.byCurrency.map((block) => {
        const sale = data.sales?.summary.find(
          (s) => s.currency === block.currency,
        );
        const stock = data.stock?.summary.byCurrency.find(
          (s) => s.currency === block.currency,
        );
        const currency = block.currency ?? copy.unknownCurrency;
        const money = (v: string | null | undefined) =>
          v == null
            ? copy.unavailable
            : `${formatTableValue(v, "money", locale)} ${currency}`;
        const pct = (v: string | null | undefined) =>
          v == null
            ? copy.unavailable
            : formatTableValue(v, "percentage", locale);
        const num = (v: string | number | null | undefined) =>
          v == null
            ? copy.unavailable
            : formatTableValue(v, "quantity", locale);
        const link = (
          path: string,
          detail: Record<string, string | null> = {},
        ) =>
          href(path, {
            currency: block.currency ?? "__unassigned__",
            ...detail,
          });
        const dead = block.statuses.find((s) => s.status === "DEAD"),
          risk = block.statuses.find((s) => s.status === "RISK");
        const deadCount = dead?.skuCount ?? 0,
          riskCount = risk?.skuCount ?? 0;
        const shortage = block.statuses.reduce(
            (n, s) => n + s.shortageSkuCount,
            0,
          ),
          offSeason =
            block.statuses.find((s) => s.status === "OFF_SEASON")?.skuCount ??
            0;
        const bottleneck = block.bottleneck;
        const assessmentComplete = block.classificationCoverage.state === "COMPLETE";
        const statusNames: Record<string, string> = {
          HEALTHY: copy.healthy,
          RISK: copy.risk,
          DEAD: copy.dead,
          NEW: copy.new,
          OFF_SEASON: copy.offSeasonLabel,
          OOS: copy.outOfStock,
          DATA_ERROR: copy.dataError,
          SERVICE: copy.service,
        };
        const revenueSentence =
          sale?.revenueChangePct != null
            ? fill(copy.revenueSentence, {
                change:
                  (sale.revenueChangePct.startsWith("-") ? "" : "+") +
                  pct(sale.revenueChangePct),
              })
            : sale?.plan.attainmentPct != null
              ? fill(copy.planSentence, { value: pct(sale.plan.attainmentPct) })
              : null;
        return (
          <section key={currency} aria-label={currency} className="space-y-6">
            <h2 className="text-sm font-semibold">{currency}</h2>
            {block.currency === null ? <Small>{lang === "uk" ? "Окрема група без підтвердженої валюти або залишку. Ці записи не скасовують відомі суми UAH нижче; невідомі дані не замінюються нулями." : "Separate records with unverified currency or stock. They do not invalidate the known UAH amounts below; unknown data is not replaced with zero."}</Small> : null}
            <section
              aria-label={copy.summary}
              className="rounded-xl bg-(--text) p-5 md:p-6 text-(--bg) space-y-3 text-sm leading-relaxed wrap-break-word"
            >
              {revenueSentence ? (
                <p>
                  {revenueSentence}.
                  {block.contributors.length ? (
                    <>
                      {" "}
                      {copy.contributors}:{" "}
                      {block.contributors.map((b, i) => (
                        <span key={b.id ?? "unassigned"}>
                          {i ? ", " : ""}
                          <strong translate="no">
                            {b.id === null ? copy.unknownBrand : b.name}
                          </strong>{" "}
                          {money(b.delta)}
                          {b.oneOffLy ? ` (${copy.oneOff})` : ""}
                        </span>
                      ))}
                      .
                    </>
                  ) : null}
                </p>
              ) : null}
              {block.deadShare !== null ? (
                <p>
                  {fill(copy.deadSentence, {
                    share: pct(block.deadShare),
                    amount: money(dead ? dead.stockCost : "0"),
                  })}
                  .
                  {bottleneck ? (
                    <>
                      {" "}
                      {fill(copy.bottleneckSentence, {
                        brand:
                          (monobrand
                            ? bottleneck.categoryId
                            : bottleneck.brandId) === null
                            ? monobrand
                              ? copy.unknownCategory
                              : copy.unknownBrand
                            : bottleneck.name,
                        amount: money(bottleneck.stockCost),
                      })}
                      ; {copy.str.toLocaleLowerCase(locale)}:{" "}
                      {pct(bottleneck.sellThroughRatio)}
                      {!bottleneck.strComplete ? ` (${copy.partial})` : ""}.
                    </>
                  ) : null}
                </p>
              ) : null}
              {!revenueSentence && block.deadShare === null ? (
                <p>{copy.noSummary}</p>
              ) : null}
            </section>
            <section
              aria-label={copy.analysis}
              className="grid gap-4 lg:grid-cols-3"
            >
              <Metric
                title={copy.revenue}
                href={link("/sales", {
                  metric: "revenue",
                  groupBy: monobrand ? "category" : "brand",
                })}
                footer={
                  !sale || sale.plan.target === null ? (
                    <Link
                      href={href("/settings")}
                      className="underline underline-offset-4"
                    >
                      {copy.setPlan}
                    </Link>
                  ) : null
                }
              >
                <Value>{money(sale?.current.revenue)}</Value>
                <Small>
                  {copy.orders}: {num(sale?.current.orderCount)}
                </Small>
                {!view.history.current ||
                (sale?.current.missingRevenueCount ?? 0) > 0 ? (
                  <Small>{copy.partial}</Small>
                ) : null}
                {sale?.plan.target != null ? (
                  <>
                    <Small>
                      {copy.plan}: {money(sale.plan.target)} ·{" "}
                      {pct(sale.plan.attainmentPct)}
                    </Small>
                    <div
                      className="mt-3 h-2 rounded-sm bg-(--input-hover) overflow-hidden"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full"
                        style={{
                          background:
                            block.planTone === "GREEN"
                              ? "#599577"
                              : block.planTone === "AMBER"
                                ? "#d19a35"
                                : block.planTone === "RED"
                                  ? "#a74b44"
                                  : "var(--muted)",
                          width: `${Math.max(0, Math.min(100, Number(sale.plan.attainmentPct ?? 0) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className={"mt-2 text-xs " + tone(block.planTone)}>
                      {copy.pace}: {pct(sale.plan.pacePct)}
                    </p>
                    <Small>
                      {copy.expected}: {money(sale.plan.expected)}
                    </Small>
                    {sale.plan.reason === "PLAN_ZERO" ? (
                      <Small>{copy.planZero}</Small>
                    ) : null}
                    <Small>
                      {monobrand ? copy.clientPlanMono : copy.clientPlan}
                    </Small>
                  </>
                ) : (
                  <Small>{copy.noPlan}</Small>
                )}
                <Small>
                  {copy.ly}: {money(sale?.ly.revenue)}
                  {!view.history.ly || (sale?.ly.missingRevenueCount ?? 0) > 0
                    ? ` (${copy.partial})`
                    : ""}{" "}
                  ·{" "}
                  <span className={tone(block.changeTone)}>
                    {sale?.comparisonReason === "LY_NON_POSITIVE"
                      ? sale.ly.revenue === "0"
                        ? copy.newPeriod
                        : copy.unavailable
                      : sale?.revenueChangePct != null
                        ? pct(sale.revenueChangePct)
                        : copy.noLy}
                  </span>
                </Small>
                {block.trend ? (
                  <Trend
                    rows={block.trend}
                    history={block.trendHistory}
                    locale={locale}
                    money={money}
                    copy={copy}
                  />
                ) : (
                  <Small>
                    {view.trendUnavailableReason === "INPUT_LIMIT"
                      ? copy.trendLimited
                      : copy.trendMissing}
                  </Small>
                )}
              </Metric>
              <Metric
                title={copy.margin}
                href={link("/sales", {
                  metric: "gmPct",
                  groupBy: monobrand ? "category" : "brand",
                })}
              >
                <Small>{copy.covered}</Small>
                <Value>{money(sale?.current.coveredGrossProfit)}</Value>
                <p
                  className={
                    "mt-3 font-semibold tabular-nums " +
                    tone(
                      sale?.coveredMarginBelowTarget === null || !sale
                        ? "UNAVAILABLE"
                        : sale.coveredMarginBelowTarget
                          ? "RED"
                          : "GREEN",
                    )
                  }
                >
                  {pct(sale?.current.gmPct)} ·{" "}
                  {sale?.coveredMarginBelowTarget == null
                    ? copy.unavailable
                    : sale.coveredMarginBelowTarget
                      ? copy.below
                      : copy.normal}
                </p>
                <Small>
                  {copy.threshold}: {pct(sale?.marginTargetPct)}
                </Small>
                <Small>
                  {copy.ly}: {money(sale?.ly.coveredGrossProfit)}
                  {sale?.ly.coverage !== "COMPLETE"
                    ? ` (${copy.partial})`
                    : ""}{" "}
                  · {pct(sale?.ly.gmPct)}
                </Small>
                <Small>{copy.marginBasis}</Small>
                <Small>
                  {copy.coveredRevenue}: {money(sale?.current.coveredRevenue)};{" "}
                  {copy.uncovered}: {num(sale?.current.missingProfitCount)}
                </Small>
                {sale?.current.coverage !== "COMPLETE" ? (
                  <Small>{copy.partial}</Small>
                ) : null}
              </Metric>
              <Metric
                title={copy.stock}
                href={link("/stock")}
                footer={
                  block.ownership.some((o) => o.unknownBrands > 0) ? (
                    <Link
                      href={href("/settings")}
                      className={
                        "underline underline-offset-4 " + styles.warning
                      }
                    >
                      {copy.unknownOwnership}
                      {!monobrand && (
                        <>
                          :{" "}
                          {block.ownership.reduce(
                            (n, o) => n + o.unknownBrands,
                            0,
                          )}{" "}
                          {copy.brands}
                        </>
                      )}
                    </Link>
                  ) : null
                }
              >
                <Value>{money(stock?.stockCost)}</Value>
                <Small>
                  {copy.cost} · {num(stock?.quantity)} {copy.units}
                </Small>
                {stock?.stockCost == null && stock ? (
                  <Small>
                    {copy.coveredCost}: {money(stock.coveredStockCost)} ·{" "}
                    {copy.partial}
                  </Small>
                ) : null}
                <div
                  className="mt-4 flex h-2 overflow-hidden rounded-sm bg-(--input-hover)"
                  aria-hidden="true"
                >
                  {block.statuses
                    .filter((s) => s.share !== null && s.share !== "0")
                    .map((s) => (
                      <span
                        key={s.status}
                        style={{
                          width: `${Number(s.share) * 100}%`,
                          background: statusColors[s.status],
                        }}
                      />
                    ))}
                </div>
                <Small>{copy.structureBasis}</Small>
                <ul className="mt-4 space-y-2 text-xs">
                  {block.statuses
                    .filter((s) => s.physicalSkuCount > 0)
                    .map((s) => (
                      <li
                        key={s.status}
                        className="flex flex-wrap justify-between gap-2"
                      >
                        <span>
                          <span
                            className="inline-block mr-2 h-2 w-2 rounded-xs"
                            style={{ background: statusColors[s.status] }}
                            aria-hidden="true"
                          />
                          {statusNames[s.status]}
                        </span>
                        <span className="tabular-nums">
                          {money(s.stockCost)} ·{" "}
                          {s.share !== null ? `${pct(s.share)} · ` : ""}
                          {s.skuCount} {copy.skus}
                        </span>
                      </li>
                    ))}
                </ul>
                <p
                  className={
                    "mt-4 text-sm " + tone(stock?.turnoverTone ?? "UNAVAILABLE")
                  }
                >
                  {copy.turnover}: {num(stock?.turnoverMonths)} {copy.months}
                </p>
                <Small>
                  {copy.norm}: {view.settings.turnoverMonths} {copy.months}
                </Small>
                <p
                  className={
                    "mt-3 text-sm " +
                    tone(stock?.availability.tone ?? "UNAVAILABLE")
                  }
                >
                  {copy.availability}: {pct(stock?.availability.ratio)}
                </p>
                <Small>
                  {num(stock?.availability.activeInStockSkuCount)} /{" "}
                  {num(stock?.availability.activeSkuCount)} {copy.active}
                </Small>
                {block.ownership.map((o) => (
                  <Small key={o.ownership}>
                    {o.ownership === "OWN"
                      ? copy.owned
                      : o.ownership === "CONSIGNMENT"
                        ? copy.consignment
                        : copy.unknownOwnership}
                    : {money(o.stockCost)}
                  </Small>
                ))}
              </Metric>
            </section>
            <section aria-label={copy.actions}>
              <h2 className="mb-4 font-semibold">{copy.actions}</h2>
              {!assessmentComplete ? (
                <p role="status" className="mb-4 text-sm text-(--muted)">
                  {block.classificationCoverage.state === "PARTIAL"
                    ? copy.classificationPartial : copy.classificationUnavailable}
                </p>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className={panel + " p-5"}>
                  <h3 className="font-semibold">{copy.dead}</h3>
                  <div className="mt-4">
                    <Value>{money(dead ? dead.stockCost : assessmentComplete ? "0" : null)}</Value>
                  </div>
                  <Small>
                    {deadCount > 0 || assessmentComplete ? deadCount : "—"} {copy.skus}
                  </Small>
                  <Small>
                    {fill(copy.deadRule, {
                      days: String(view.settings.deadDays),
                      weeks: String(view.settings.riskWohWeeks),
                    })}
                  </Small>
                  {deadCount > 0 ? (
                    <Link
                      className={button + " mt-5"}
                      href={link("/repricing", { classification: "DEAD" })}
                    >
                      {copy.reprice}
                    </Link>
                  ) : (
                    <p className={"mt-4 text-sm " + (assessmentComplete ? styles.good : "text-(--muted)")}>
                      {assessmentComplete ? copy.noDead : copy.assessmentUnavailable}
                    </p>
                  )}
                </article>
                <article className={panel + " p-5"}>
                  <h3 className="font-semibold">{copy.risk}</h3>
                  <div className="mt-4">
                    <Value>{money(risk ? risk.stockCost : assessmentComplete ? "0" : null)}</Value>
                  </div>
                  <Small>
                    {riskCount > 0 || assessmentComplete ? riskCount : "—"} {copy.skus}
                  </Small>
                  {riskCount > 0 ? (
                    <>
                      <Small>
                        {copy.woh}: {num(risk?.minWoh)}–{num(risk?.maxWoh)}{" "}
                        {copy.weeks}
                      </Small>
                      <Link
                        className={button + " mt-5"}
                        href={link("/stock", { classification: "RISK" })}
                      >
                        {copy.viewRisk}
                      </Link>
                    </>
                  ) : (
                    <p className={"mt-4 text-sm " + (assessmentComplete ? styles.good : "text-(--muted)")}>
                      {assessmentComplete ? copy.noRisk : copy.assessmentUnavailable}
                    </p>
                  )}
                </article>
                <article className={panel + " p-5"}>
                  <h3 className="font-semibold">{copy.shortage}</h3>
                  <div className="mt-4">
                    <Value>
                      {shortage > 0 || assessmentComplete ? shortage : "—"} {copy.skus}
                    </Value>
                  </div>
                  <Small>
                    {copy.offSeason}: {offSeason}
                  </Small>
                  {shortage > 0 ? (
                    <Link
                      className={button + " mt-5"}
                      href={link("/reordering", { mode: "shortage" })}
                    >
                      {copy.reorder}
                    </Link>
                  ) : (
                    <p className={"mt-4 text-sm " + (assessmentComplete ? styles.good : "text-(--muted)")}>
                      {assessmentComplete ? copy.noShortage : copy.assessmentUnavailable}
                    </p>
                  )}
                </article>
                <article className={panel + " p-5"}>
                  <h3 className="font-semibold">{copy.bottleneck}</h3>
                  {bottleneck ? (
                    <>
                      <h4
                        translate="no"
                        className="mt-4 font-semibold wrap-break-word"
                      >
                        {(monobrand
                          ? bottleneck.categoryId
                          : bottleneck.brandId) === null
                          ? monobrand
                            ? copy.unknownCategory
                            : copy.unknownBrand
                          : bottleneck.name}
                      </h4>
                      <Small>
                        {copy.stock}: {money(bottleneck.stockCost)} ·{" "}
                        {num(bottleneck.quantity)} {copy.units}
                      </Small>
                      <Small>
                        {copy.str}: {pct(bottleneck.sellThroughRatio)}
                        {!bottleneck.strComplete ? ` (${copy.partial})` : ""}
                      </Small>
                      <Small>
                        {copy.firstReceipt}:{" "}
                        {bottleneck.firstReceiptDate
                          ? date(bottleneck.firstReceiptDate)
                          : copy.unavailable}
                      </Small>
                      <Link
                        className={button + " mt-5"}
                        href={link("/stock", {
                          brandId: monobrand
                            ? null
                            : (bottleneck.brandId ?? "__unassigned__"),
                          categoryId: monobrand
                            ? (bottleneck.categoryId ?? "__unassigned__")
                            : null,
                          classification: null,
                        })}
                      >
                        {monobrand ? copy.openCategory : copy.openBrand}
                      </Link>
                    </>
                  ) : (
                    <Small>
                      {!assessmentComplete ? copy.assessmentUnavailable
                        : deadCount > 0 ? copy.missingBottleneck : copy.noBottleneck}
                    </Small>
                  )}
                </article>
              </div>
            </section>
          </section>
        );
      })}
    </div>
  );
}
