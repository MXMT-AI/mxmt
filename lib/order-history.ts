import { Temporal } from "@js-temporal/polyfill";
import type { SalesPeriod } from "./sales-period";
export function createOrderHistoryCoverage(
  windows: Array<{ from: string; to: string }>,
  through: string | null,
  timezone: string,
  busy: boolean,
) {
  const zoned = (v: string) =>
    Temporal.Instant.from(v).toZonedDateTimeISO(timezone);
  const completedThrough = (v: string) => {
    const t = zoned(v);
    return (
      Temporal.PlainTime.compare(
        t.toPlainTime(),
        Temporal.PlainTime.from("23:59:59.999"),
      ) >= 0
        ? t.toPlainDate()
        : t.toPlainDate().subtract({ days: 1 })
    ).toString();
  };
  const sorted = windows
    .map((w) => {
      const from = zoned(w.from);
      return {
        from: (Temporal.PlainTime.compare(
          from.toPlainTime(),
          Temporal.PlainTime.from("00:00"),
        ) === 0
          ? from.toPlainDate()
          : from.toPlainDate().add({ days: 1 })
        ).toString(),
        to: completedThrough(w.to),
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from));
  const spans: Array<{ from: string; to: string }> = [];
  for (const w of sorted) {
    const previous = spans.at(-1);
    if (
      previous &&
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(previous.to).add({ days: 1 }),
        Temporal.PlainDate.from(w.from),
      ) >= 0
    ) {
      if (w.to > previous.to) previous.to = w.to;
    } else spans.push({ ...w });
  }
  if (through && spans.length) {
    const end = completedThrough(through);
    if (end > spans.at(-1)!.to) spans.at(-1)!.to = end;
  }
  const covers = (from: string, to: string) =>
    !busy && from <= to && spans.some((s) => s.from <= from && s.to >= to);
  return { covers, spans };
}
export function salesHistoryCoverage(
  windows: Array<{ from: string; to: string }>,
  through: string | null,
  period: SalesPeriod,
  timezone: string,
  busy: boolean,
) {
  const { covers } = createOrderHistoryCoverage(
    windows,
    through,
    timezone,
    busy,
  );
  return {
    current: covers(period.from, period.to),
    ly: covers(period.lyFrom, period.lyTo),
  };
}
