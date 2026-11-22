"use client";
import { ReportHeader } from "@/components/merchandising/report-header/report-header";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Link } from "@/i18n/navigation";
import StockHistory from "../stock-history/stock-history";
import { panel } from "@/components/ui/panel/panel-styles";
import { button } from "@/components/ui/button/button-styles";
import { Note } from "@/components/ui/note/note";
import type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";
import type { Lang } from "@/lib/translations";
import { stockCopy } from "@/lib/stock-copy";
import { freshnessLabel } from "@/lib/freshness-label";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { readScreenControls } from "@/lib/client/merchandising-screen-request";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";

import type { Href } from "./stock-content-types";
import { StockCost } from "../stock-cost/stock-cost";
import { StockQualityRing } from "../stock-quality-ring/stock-quality-ring";
import { StockCategories } from "../stock-categories/stock-categories";
import { StockSkuTable } from "../stock-sku-table/stock-sku-table";
import { StockBrands } from "../stock-brands/stock-brands";
import { stockStockContentMessages as englishCopy } from "@/messages/en.json";
import { stockStockContentMessages as ukrainianCopy } from "@/messages/uk.json";

const scopeKeys = ["brandId", "categoryId", "skuId", "currency"];

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
    locale = lang === "uk" ? "uk-UA" : "en-GB";
  if (!model) return null;
  const params = new URLSearchParams(query);
  params.set("snapshotId", data.context.snapshotId);
  params.set("dateFrom", data.context.period.from);
  params.set("dateTo", data.context.period.to);
  const linkControls = readScreenControls("stock", params, { includeEmpty: true });
  const href: Href = (values) =>
    merchandisingHref("/stock", params, { ...linkControls, ...values });
  const formatValue = createTableValueFormatter(locale);
  const reportDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Europe/Kyiv",
  });
  const date = (value: string) =>
    reportDate.format(new Date(value.length === 10 ? value + "T12:00:00Z" : value));
  return (
    <div className="space-y-6">
      <ReportHeader
        title={copy.title}
        description={<>{copy.snapshot}: {date(model.asOf)} · {copy.allChannels}</>}
        metadata={<>{copy.cutoff}: {new Intl.DateTimeFormat(locale, {
          dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Kyiv",
        }).format(new Date(model.cutoff))}</>}
        action={onRefresh && <Button variant="report" onClick={onRefresh}>{copy.refresh}</Button>}
      />
      <Note>{freshnessLabel(data.freshness.status, lang)}</Note>
      {scopeKeys.some((key) => params.has(key)) ? (
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
        <Text variant="body" role="status" className="leading-normal text-inherit">
          {copy.legacy}
        </Text>
      ) : null}
      {model.byCurrency.length === 0 ? <Text variant="body" role="status" className="leading-normal text-base text-inherit">{copy.empty}</Text> : null}
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
              <Heading as="h2" variant="compact" className="text-lg font-bold text-inherit">
                {block.currency ?? (lang === "uk" ? ukrainianCopy.unverifiedCurrencyStock : englishCopy.unverifiedCurrencyStock)}
              </Heading>
              {block.currency === null ? <Note>{lang === "uk" ? ukrainianCopy.separateRecordsWithoutVerifiedCurrency : englishCopy.separateRecordsWithoutVerifiedCurrency}</Note> : null}
              <div className="text-sm tabular-nums">
                {copy.fullStock}:{" "}
                <strong>
                  <StockCost
                    value={block.stockCost}
                    covered={block.coveredStockCost}
                    formatValue={formatValue}
                    copy={copy}
                  />
                </strong>
                <span className="ml-3 text-(--muted)">
                  {copy.quantity}: {formatValue(block.quantity, "quantity")}
                </span>
              </div>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <section className={panel}>
                {model.classificationAvailable ? (
                  <StockQualityRing
                    block={block}
                    selected={model.selectedStatus}
                    copy={copy}
                    locale={locale}
                    href={scoped}
                  />
                ) : (
                  <Text variant="body" className="leading-normal text-base text-inherit p-5">{copy.legacy}</Text>
                )}
              </section>
              <section className={panel + " p-5 flex flex-col self-start min-w-0"}>
                <Heading as="h3" variant="compact" className="text-base text-inherit">{englishCopy.k2}{copy.history}</Heading>
                <StockHistory history={model.history} currency={block.currency} lang={lang}/>
              </section>
            </div>
            <StockCategories
              groups={block.categories} model={model} copy={copy}
              locale={locale} href={scoped} onNavigate={onNavigate}
            />
            {!model.monobrand && (
              <StockBrands groups={block.brands} selectedStatus={model.selectedStatus} copy={copy} locale={locale} href={scoped} date={date} />
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
        <StockSkuTable table={data.table} monobrand={model.monobrand} params={params} href={href} copy={copy} locale={locale} />
      ) : null}
    </div>
  );
}
