import { Temporal } from "@js-temporal/polyfill";
export class SalesPeriodError extends Error {}
export interface SalesPeriod {
  from: string;
  to: string;
  lyFrom: string;
  lyTo: string;
  asOf: string;
  days: number;
  leapDayPolicy: "CLAMP_TO_FEBRUARY_28";
}
/** D15 uses completed Kyiv calendar days; custom endpoints are inclusive. */
export function resolveSalesPeriod(
  input: { dateFrom?: string; dateTo?: string; now?: Date } = {},
): SalesPeriod {
  const today = Temporal.Instant.from((input.now ?? new Date()).toISOString())
    .toZonedDateTimeISO("Europe/Kyiv")
    .toPlainDate();
  try {
    if (Boolean(input.dateFrom) !== Boolean(input.dateTo)) throw new Error();
    const defaultFrom =
      today.day <= 6
        ? today.subtract({ months: 1 }).with({ day: 1 })
        : today.with({ day: 1 });
    const defaultTo =
      today.day <= 6
        ? today.with({ day: 1 }).subtract({ days: 1 })
        : today.subtract({ days: 1 });
    const parse = (s: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error();
      return Temporal.PlainDate.from(s, { overflow: "reject" });
    };
    const from = input.dateFrom ? parse(input.dateFrom) : defaultFrom,
      to = input.dateTo ? parse(input.dateTo) : defaultTo;
    const days = from.until(to).days + 1;
    if (
      days < 1 ||
      days > 366 ||
      Temporal.PlainDate.compare(to, today) > 0 ||
      from.year < 2000
    )
      throw new Error();
    return {
      from: from.toString(),
      to: to.toString(),
      lyFrom: from.subtract({ years: 1 }).toString(),
      lyTo: to.subtract({ years: 1 }).toString(),
      asOf: today.toString(),
      days,
      leapDayPolicy: "CLAMP_TO_FEBRUARY_28",
    };
  } catch {
    throw new SalesPeriodError(
      "Select a valid inclusive period of at most 366 days, ending no later than today.",
    );
  }
}
