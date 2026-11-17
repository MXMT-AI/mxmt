import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import type { HistoryPoints } from "./stock-history-types";

export function formatStockHistoryPoints(points: HistoryPoints, locale: string) {
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
  const formatValue = createTableValueFormatter(locale);
  const formatTime = (value: string | null) => value ? `${time.format(new Date(value))} UTC` : "—";

  const formatPoint = (point: HistoryPoints[number]["current"]) => {
    const cost = point.stockCost === null ? null : Number(point.stockCost);
    return {
      date: point.date,
      dateLabel: date.format(new Date(`${point.date}T12:00:00Z`)),
      cost: cost !== null && Number.isFinite(cost) ? cost : null,
      costLabel: point.stockCost === null ? null : formatValue(point.stockCost, "money"),
      quantityLabel: formatValue(point.quantity, "quantity"),
      observedCount: point.observedCount,
      cohortSize: point.cohortSize,
      firstObservedLabel: formatTime(point.firstObservedAt),
      lastObservedLabel: formatTime(point.lastObservedAt),
    };
  };
  return points.map(({ current, priorYear }) => ({
    current: formatPoint(current),
    priorYear: formatPoint(priorYear),
  }));
}

export type FormattedHistoryPoints = ReturnType<typeof formatStockHistoryPoints>;
