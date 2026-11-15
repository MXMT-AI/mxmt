import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import type { Lang } from "@/lib/translations";
import { overviewCopy } from "@/lib/overview-copy";
import { formatTableValue } from "@/lib/data-reporting-ui";
import { stockStatusColors as statusColors } from "@/lib/merchandising-stock-display";
import type { OverviewResponse, CurrencyBlock, OverviewLink } from "../overview-types";
import { OverviewMetric } from "../overview-metric/overview-metric";
import { OverviewTrend } from "../overview-trend/overview-trend";
import { OverviewSummary } from "../overview-summary/overview-summary";
import { OverviewActions } from "../overview-actions/overview-actions";
import { OverviewValue } from "../overview-value/overview-value";
const tone = (value: string) =>
  value === "GREEN"
    ? "text-report-positive"
    : value === "AMBER"
      ? "text-report-warning"
      : value === "RED"
        ? "text-report-negative"
        : "text-(--muted)";

export function OverviewCurrencySection({ block, view, sales, stock: stockData, lang, monobrand, href, date }: {
  block: CurrencyBlock;
  view: NonNullable<OverviewResponse["overview"]>;
  sales: OverviewResponse["sales"];
  stock: OverviewResponse["stock"];
  lang: Lang;
  monobrand: boolean;
  href: OverviewLink;
  date: (value: string) => string;
}) {
  const copy = overviewCopy[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const sale = sales?.summary.find(
    (s) => s.currency === block.currency,
  );
  const stock = stockData?.summary.byCurrency.find(
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
  return (
    <section aria-label={currency} className="space-y-6">
      <h2 className="text-sm font-semibold">{currency}</h2>
      {block.currency === null ? <Note className="mt-2">{lang === "uk" ? "Окрема група без підтвердженої валюти або залишку. Ці записи не скасовують відомі суми UAH нижче; невідомі дані не замінюються нулями." : "Separate records with unverified currency or stock. They do not invalidate the known UAH amounts below; unknown data is not replaced with zero."}</Note> : null}
      <OverviewSummary block={block} sale={sale} monobrand={monobrand} copy={copy} locale={locale} money={money} pct={pct} />
      <section
        aria-label={copy.analysis}
        className="grid gap-4 lg:grid-cols-3"
      >
        <OverviewMetric
          metric="sales"
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
          <OverviewValue>{money(sale?.current.revenue)}</OverviewValue>
          <Note className="mt-2">
            {copy.orders}: {num(sale?.current.orderCount)}
          </Note>
          {!view.history.current ||
          (sale?.current.missingRevenueCount ?? 0) > 0 ? (
            <Note className="mt-2">{copy.partial}</Note>
          ) : null}
          {sale?.plan.target != null ? (
            <>
              <Note className="mt-2">
                {copy.plan}: {money(sale.plan.target)} ·{" "}
                {pct(sale.plan.attainmentPct)}
              </Note>
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
              <Note className="mt-2">
                {copy.expected}: {money(sale.plan.expected)}
              </Note>
              {sale.plan.reason === "PLAN_ZERO" ? (
                <Note className="mt-2">{copy.planZero}</Note>
              ) : null}
              <Note className="mt-2">
                {monobrand ? copy.clientPlanMono : copy.clientPlan}
              </Note>
            </>
          ) : (
            <Note className="mt-2">{copy.noPlan}</Note>
          )}
          <Note className="mt-2">
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
          </Note>
          {block.trend ? (
            <OverviewTrend
              rows={block.trend}
              history={block.trendHistory}
              locale={locale}
              money={money}
              copy={copy}
            />
          ) : (
            <Note className="mt-2">
              {view.trendUnavailableReason === "INPUT_LIMIT"
                ? copy.trendLimited
                : copy.trendMissing}
            </Note>
          )}
        </OverviewMetric>
        <OverviewMetric
          metric="margin"
          title={copy.margin}
          href={link("/sales", {
            metric: "gmPct",
            groupBy: monobrand ? "category" : "brand",
          })}
        >
          <Note className="mt-2">{copy.covered}</Note>
          <OverviewValue>{money(sale?.current.coveredGrossProfit)}</OverviewValue>
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
          <Note className="mt-2">
            {copy.threshold}: {pct(sale?.marginTargetPct)}
          </Note>
          <Note className="mt-2">
            {copy.ly}: {money(sale?.ly.coveredGrossProfit)}
            {sale?.ly.coverage !== "COMPLETE"
              ? ` (${copy.partial})`
              : ""}{" "}
            · {pct(sale?.ly.gmPct)}
          </Note>
          <Note className="mt-2">{copy.marginBasis}</Note>
          <Note className="mt-2">
            {copy.coveredRevenue}: {money(sale?.current.coveredRevenue)};{" "}
            {copy.uncovered}: {num(sale?.current.missingProfitCount)}
          </Note>
          {sale?.current.coverage !== "COMPLETE" ? (
            <Note className="mt-2">{copy.partial}</Note>
          ) : null}
        </OverviewMetric>
        <OverviewMetric
          metric="stock"
          title={copy.stock}
          href={link("/stock")}
          footer={
            block.ownership.some((o) => o.unknownBrands > 0) ? (
              <Link
                href={href("/settings")}
                className={
                  "underline underline-offset-4 " + "text-report-warning"
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
          <OverviewValue>{money(stock?.stockCost)}</OverviewValue>
          <Note className="mt-2">
            {copy.cost} · {num(stock?.quantity)} {copy.units}
          </Note>
          {stock?.stockCost == null && stock ? (
            <Note className="mt-2">
              {copy.coveredCost}: {money(stock.coveredStockCost)} ·{" "}
              {copy.partial}
            </Note>
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
          <Note className="mt-2">{copy.structureBasis}</Note>
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
          <Note className="mt-2">
            {copy.norm}: {view.settings.turnoverMonths} {copy.months}
          </Note>
          <p
            className={
              "mt-3 text-sm " +
              tone(stock?.availability.tone ?? "UNAVAILABLE")
            }
          >
            {copy.availability}: {pct(stock?.availability.ratio)}
          </p>
          <Note className="mt-2">
            {num(stock?.availability.activeInStockSkuCount)} /{" "}
            {num(stock?.availability.activeSkuCount)} {copy.active}
          </Note>
          {block.ownership.map((o) => (
            <Note className="mt-2" key={o.ownership}>
              {o.ownership === "OWN"
                ? copy.owned
                : o.ownership === "CONSIGNMENT"
                  ? copy.consignment
                  : copy.unknownOwnership}
              : {money(o.stockCost)}
            </Note>
          ))}
        </OverviewMetric>
      </section>
      <OverviewActions block={block} settings={view.settings} monobrand={monobrand} copy={copy} money={money} pct={pct} num={num} date={date} link={link} />
    </section>
  );
}
