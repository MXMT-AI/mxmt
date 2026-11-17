"use client";
import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";
import type { Lang } from "@/lib/translations";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { freshnessLabel } from "@/lib/freshness-label";
import { salesCopy } from "@/lib/sales-copy";

import { SalesCurrencySection } from "../sales-currency-section/sales-currency-section";
import { SalesHeader } from "../sales-header/sales-header";
import { SalesControls } from "../sales-controls/sales-controls";
import type { SalesHref } from "../sales-types";

const scopeKeys = ["brandId", "categoryId", "skuId", "currency"];
type CurrencySummary = NonNullable<OverviewResponse["sales"]>["summary"][number];

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
  const pageControls = {
    ...(params.has("page") ? { page: params.get("page") } : {}),
    ...(params.has("channelPage") ? { channelPage: params.get("channelPage") } : {}),
  };
  const showOthers = params.has("others");
  const summariesByCurrency = new Map<string | null, CurrencySummary>();
  for (const summary of data.sales?.summary ?? []) {
    if (!summariesByCurrency.has(summary.currency)) {
      summariesByCurrency.set(summary.currency, summary);
    }
  }
  const href: SalesHref = (values) =>
    merchandisingHref("/sales", params, { ...pageControls, ...values });
  const mono = model.monobrand;
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
      <SalesHeader
        period={model.period}
        createdAt={data.context.createdAt}
        copy={copy}
        locale={locale}
        onRefresh={onRefresh}
      />
      <Note>{freshnessLabel(data.freshness.status, lang)}</Note>
      <SalesControls model={model} copy={copy} href={href} />
      {scopeKeys.some((key) => params.has(key)) ? (
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
      {model.byCurrency.map(block => (
        <SalesCurrencySection
          key={block.currency ?? "unknown"}
          block={block}
          summary={summariesByCurrency.get(block.currency)}
          model={model}
          showOthers={showOthers}
          copy={copy}
          locale={locale}
          href={href}
        />
      ))}
    </div>
  );
}
