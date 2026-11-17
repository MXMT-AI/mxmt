import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { Locale } from "@/i18n/routing";
import type { InsightItem } from "../marketing-calendar/calendar-types";

export function CalendarSummary({ eventCount, insights, locale }: {
  eventCount: number;
  insights: InsightItem[];
  locale: Locale;
}) {
  const uk = locale === "uk";
  let tips = 0;
  let warnings = 0;
  for (const insight of insights) {
    if (insight.type === "agent") tips += 1;
    else if (insight.type === "warn") warnings += 1;
  }
  const metrics = [
    { key: "events", value: eventCount, label: uk ? "Подій у плані" : "Events in plan", color: "text-(--text)" },
    { key: "tips", value: tips, label: uk ? "Порад агента" : "Agent tips", color: "text-accent-positive" },
    { key: "warnings", value: warnings, label: uk ? "Попереджень" : "Warnings", color: "text-accent-negative" },
  ];

  return (
    <dl className="grid grid-cols-3 gap-3 mb-5">
      {metrics.map(metric => (
        <MetricTile key={metric.key} variant="centered" label={metric.label} value={String(metric.value)} valueClassName={metric.color} />
      ))}
    </dl>
  );
}
