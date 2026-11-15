"use client";
import { Link } from "@/i18n/navigation";
import { panel } from "@/components/ui/panel/panel-styles";
import { button } from "@/components/ui/button/button-styles";
import { Note } from "@/components/ui/note/note";
import type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";
import type { Lang } from "@/lib/translations";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { formatTableValue } from "@/lib/data-reporting-ui";
import { freshnessLabel } from "@/lib/freshness-label";
import { salesCopy } from "@/lib/sales-copy";

import { SalesChannelsSection } from "../sales-channels-section/sales-channels-section";
import { SalesControls } from "../sales-controls/sales-controls";
import { SalesMonthlySection } from "../sales-monthly-section/sales-monthly-section";
import { SalesCategoryChart } from "../sales-category-chart/sales-category-chart";
import type { SalesHref } from "../sales-types";
import { SalesComparisonSection } from "../sales-comparison-section/sales-comparison-section";

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
  const href: SalesHref = (values) =>
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
      <Note>{freshnessLabel(data.freshness.status, lang)}</Note>
      <SalesControls model={model} copy={copy} href={href} />
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
        const scopedHref: SalesHref = (values) =>
            href({ currency: block.currency ?? "__unassigned__", ...values }),
          summary = data.sales?.summary.find(
            (s) => s.currency === block.currency,
          );
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
            <SalesMonthlySection
              matrix={block.matrix}
              group={group}
              metric={model.metric}
              tablePeriod={model.tablePeriod}
              showOthers={params.has("others")}
              copy={copy}
              locale={locale}
              href={scopedHref}
            />
            <div className="grid gap-5 xl:grid-cols-2">
              <SalesChannelsSection channels={block.channels} copy={copy} locale={locale} href={scopedHref} />
              <section className={panel}>
                <h3 className="px-5 pt-5 font-semibold">
                  S3 · {copy.categories}
                </h3>
                <SalesCategoryChart
                  rows={block.categories}
                  locale={locale}
                  copy={copy}
                  units={units}
                  href={scopedHref}
                />
              </section>
            </div>
            <SalesComparisonSection
              comparison={block.comparison}
              period={model.period}
              history={model.history}
              oneOffAvailable={model.oneOffAvailable}
              group={group}
              units={units}
              copy={copy}
              locale={locale}
              href={scopedHref}
            />
          </section>
        );
      })}
    </div>
  );
}
