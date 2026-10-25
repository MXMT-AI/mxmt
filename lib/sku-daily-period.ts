import { Temporal } from "@js-temporal/polyfill";
export class DailySkuPeriodError extends Error {}
/** asOf is a business calendar date; current-day facts retain their actual observation time. */
export function resolveDailySkuPeriod(
  asOf?: string,
  now = new Date(),
  timezone = "Europe/Kyiv",
) {
  try {
    const instant = Temporal.Instant.from(now.toISOString()),
      today = instant.toZonedDateTimeISO(timezone).toPlainDate();
    if (asOf !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(asOf))
      throw new Error();
    const date = asOf
      ? Temporal.PlainDate.from(asOf, { overflow: "reject" })
      : today;
    if (date.year < 2000 || Temporal.PlainDate.compare(date, today) > 0)
      throw new Error();
    const end = date.add({ days: 1 }).toZonedDateTime(timezone).toInstant();
    const cutoff = Temporal.Instant.compare(end, instant) <= 0 ? end : instant;
    const fullMonthEnd =
      date.day === date.daysInMonth &&
      Temporal.Instant.compare(end, instant) <= 0
        ? date.add({ days: 1 })
        : date.with({ day: 1 });
    return {
      asOf: date.toString(),
      windowFrom: date.subtract({ days: 84 }).toString(),
      windowTo: date.subtract({ days: 1 }).toString(),
      activityFrom: date.subtract({ days: 89 }).toString(),
      cogsFrom: fullMonthEnd.subtract({ months: 3 }).toString(),
      cogsTo: fullMonthEnd.subtract({ days: 1 }).toString(),
      cutoff: cutoff.toString(),
      dayEnd: end.toString(),
      timezone,
    };
  } catch {
    throw new DailySkuPeriodError(
      "asOf must be a valid YYYY-MM-DD date no later than today.",
    );
  }
}
