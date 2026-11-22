"use client";
import type { StockHistory as History } from "@/lib/stock-history";
import type { Lang } from "@/lib/translations";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { StockHistoryChart } from "../stock-history-chart/stock-history-chart";
import { StockHistoryTable } from "../stock-history-table/stock-history-table";
import { stockHistoryCopy } from "./copy";
import { formatStockHistoryPoints } from "./stock-history-format";
import { stockStockHistoryMessages as englishCopy } from "@/messages/en.json";
import { stockStockHistoryMessages as ukrainianCopy } from "@/messages/uk.json";

export default function StockHistory({ history, currency, lang }: {
  history: History & { unavailableReason?: "COHORT_LIMIT" };
  currency: string | null;
  lang: Lang;
}) {
  const block = history.byCurrency.find(block => block.currency === currency);
  const copy = stockHistoryCopy[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  if (!block || block.state !== "READY") {
    return (
      <div className="my-5 flex min-h-64 flex-col justify-center space-y-3 rounded-lg border border-dashed border-(--border) px-6 text-center">
        <Heading as="h4" variant="compact" className="text-base text-inherit">
          {history.unavailableReason === "COHORT_LIMIT"
            ? lang === "uk" ? ukrainianCopy.narrowFiltersToViewStock : englishCopy.narrowFiltersToViewStock
            : copy.empty}
        </Heading>
        <Text variant="body" className="leading-normal text-(--muted)">{copy.body}</Text>
        {block && <Text variant="body" className="leading-normal text-inherit tabular-nums">{block.completeDays} / {block.requiredDays}</Text>}
      </div>
    );
  }
  const points = formatStockHistoryPoints(block.points, locale);
  return (
    <div className="mt-4 min-w-0 space-y-4">
      <Text variant="body" className="leading-normal text-(--muted)">{copy.basis}</Text>
      <StockHistoryChart points={points} currency={currency} copy={copy} />
      <Text variant="body" className="flex flex-wrap gap-4 leading-normal text-inherit">
        {[
          { label: copy.current, color: "bg-(--accent)" },
          { label: copy.ly, color: "bg-(--muted)" },
        ].map(series => (
          <span key={series.label}><span aria-hidden="true" className={`mr-2 inline-block h-2 w-2 rounded-full ${series.color}`} />{series.label}</span>
        ))}
        <span>{copy.cost} · {currency ?? "—"}</span>
      </Text>
      <StockHistoryTable points={points} copy={copy} />
    </div>
  );
}
