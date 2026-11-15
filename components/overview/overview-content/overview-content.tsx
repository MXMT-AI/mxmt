"use client";
import { Link } from "@/i18n/navigation";
import { Note } from "@/components/ui/note/note";
import { Button } from "@/components/ui/button/button";
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-balance">{copy.title}</h1>
          <p className="mt-1 text-sm text-(--muted)">
            {copy.snapshot}: {date(data.context.asOf)} · {copy.allChannels}
          </p>
          <p className="mt-1 text-xs text-(--muted)">
            {freshnessLabel(data.freshness.status, lang)}
            {data.freshness.historical && data.freshness.sourceStale
              ? ` · ${copy.stale}`
              : ""}
          </p>
        </div>
        {onRefresh ? (
          <Button variant="report" className="justify-start font-medium" onClick={onRefresh}>
            {copy.refresh}
          </Button>
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
          <Note className="mt-2">
            {copy.diagnostics}:{" "}
            {
              [...(data.sales?.issues ?? []), ...(data.stock?.issues ?? [])]
                .length
            }
          </Note>
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
          <Note className="mt-2">{copy.emptyHint}</Note>
          <Link className={button + " mt-4"} href={href("/settings")}>
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
