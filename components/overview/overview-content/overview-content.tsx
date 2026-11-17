"use client";
import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { panel } from "@/components/ui/panel/panel-styles";
import { button as reportButton } from "@/components/ui/button/button-styles";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/translations";
import { freshnessLabel } from "@/lib/freshness-label";
import { overviewCopy } from "@/lib/overview-copy";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import type { OverviewResponse } from "../overview-types";
import { OverviewCurrencySection } from "../overview-currency-section/overview-currency-section";

const button = cn(reportButton, "justify-start font-medium");
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
  const settingsHref = href("/settings");
  const reportDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const date = (s: string) =>
    reportDate.format(new Date(s + "T12:00:00Z"));
  const { sourceObservedAt } = data.freshness;
  const observedAt = sourceObservedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: data.context.timezone,
      }).format(new Date(sourceObservedAt))
    : copy.unavailable;
  const issueCount = (data.sales?.issues.length ?? 0) + (data.stock?.issues.length ?? 0);
  const view = data.overview;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <Note className="leading-normal">
            {data.freshness.freshnessBasis === "SHEETS_IMPORT"
              ? copy.sheetsImported
              : copy.observed}: {observedAt}
          </Note>
          <Heading as="h1" variant="page" className="mt-2 text-2xl text-inherit text-balance">{copy.title}</Heading>
          <Text variant="body" className="mt-1 leading-normal text-(--muted)">
            {copy.snapshot}: {date(data.context.asOf)} · {copy.allChannels}
          </Text>
          <Note className="mt-1 leading-normal">
            {freshnessLabel(data.freshness.status, lang)}
            {data.freshness.historical && data.freshness.sourceStale
              ? ` · ${copy.stale}`
              : ""}
          </Note>
        </div>
        {onRefresh ? (
          <Button variant="report" className="justify-start font-medium" onClick={onRefresh}>
            {copy.refresh}
          </Button>
        ) : null}
      </header>
      {issueCount > 0 ? (
        <div
          role="status"
          className={
            panel +
            " flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-xs"
          }
        >
          <p className="font-medium">{copy.partial}</p>
          <Note className="mt-2">{copy.diagnostics}: {issueCount}</Note>
          <Link
            href={settingsHref}
            className="inline-block min-h-8 py-2 underline underline-offset-4"
          >
            {copy.settings}
          </Link>
        </div>
      ) : null}
      {data.dataState === "EMPTY" ? (
        <section className={panel + " p-6"}>
          <Heading as="h2" variant="compact" className="text-base text-inherit">{copy.empty}</Heading>
          <Note className="mt-2">{copy.emptyHint}</Note>
          <Link className={button + " mt-4"} href={settingsHref}>
            {copy.settings}
          </Link>
        </section>
      ) : null}
      {view && view.byCurrency.length > 1 ? (
        <p className="text-sm text-(--muted)">{copy.currencies}</p>
      ) : null}
      {view?.byCurrency.map(block => (
        <OverviewCurrencySection key={block.currency ?? copy.unknownCurrency} block={block} view={view} sales={data.sales} stock={data.stock} lang={lang} monobrand={monobrand} href={href} date={date} />
      ))}
    </div>
  );
}
