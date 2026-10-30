import { Temporal } from "@js-temporal/polyfill";
import { resolveSalesPeriod } from "./sales-period";

export const MVP_SCREENS = [
  "overview",
  "sales",
  "stock",
  "repricing",
  "reordering",
] as const;
export type MvpScreen = (typeof MVP_SCREENS)[number];
export type PeriodMode = "month" | "quarter" | "year" | "custom";
export interface MerchandisingFilters {
  period: PeriodMode;
  dateFrom: string;
  dateTo: string;
  channelId: string;
}
const SHARED_KEYS = [
  "period",
  "dateFrom",
  "dateTo",
  "channelId",
  "asOf",
  "snapshotId",
] as const;
const DETAIL_KEYS = ["brandId", "categoryId", "skuId", "currency"] as const;

export function presetPeriod(
  mode: Exclude<PeriodMode, "custom">,
  anchor: string,
  now = new Date(),
) {
  const day = Temporal.PlainDate.from(anchor, { overflow: "reject" });
  const today = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO("Europe/Kyiv")
    .toPlainDate();
  const from =
    mode === "month"
      ? day.with({ day: 1 })
      : mode === "quarter"
        ? day.with({ month: Math.floor((day.month - 1) / 3) * 3 + 1, day: 1 })
        : day.with({ month: 1, day: 1 });
  const end = from
    .add(
      mode === "month"
        ? { months: 1 }
        : mode === "quarter"
          ? { months: 3 }
          : { years: 1 },
    )
    .subtract({ days: 1 });
  const yesterday = today.subtract({ days: 1 });
  return resolveSalesPeriod({
    dateFrom: from.toString(),
    dateTo: (Temporal.PlainDate.compare(end, yesterday) > 0
      ? yesterday
      : end
    ).toString(),
    now,
  });
}

export function readMerchandisingFilters(
  params: URLSearchParams,
  now = new Date(),
): MerchandisingFilters {
  for (const key of SHARED_KEYS)
    if (params.getAll(key).length > 1) throw new Error("INVALID_FILTERS");
  const period =
    params.get("period") ??
    (params.has("dateFrom") || params.has("dateTo") ? "custom" : "month");
  if (!["month", "quarter", "year", "custom"].includes(period))
    throw new Error("INVALID_FILTERS");
  const dateFrom = params.get("dateFrom"),
    dateTo = params.get("dateTo");
  if (
    (dateFrom === null) !== (dateTo === null) ||
    dateFrom === "" ||
    dateTo === ""
  )
    throw new Error("INVALID_FILTERS");
  const resolved = resolveSalesPeriod({
    dateFrom: dateFrom ?? undefined,
    dateTo: dateTo ?? undefined,
    now,
  });
  if (dateFrom && period !== "custom") {
    const preset = presetPeriod(
      period as Exclude<PeriodMode, "custom">,
      dateFrom,
      now,
    );
    if (preset.from !== resolved.from || resolved.to > preset.to)
      throw new Error("INVALID_FILTERS");
  }
  const dates =
    !dateFrom && period !== "custom"
      ? presetPeriod(
          period as Exclude<PeriodMode, "custom">,
          resolved.from,
          now,
        )
      : resolved;
  const channelId = params.get("channelId") ?? "";
  if (channelId.length > 200 || (params.has("channelId") && !channelId))
    throw new Error("INVALID_FILTERS");
  return {
    period: period as PeriodMode,
    dateFrom: dates.from,
    dateTo: dates.to,
    channelId,
  };
}

export function merchandisingHref(
  path: string,
  params: URLSearchParams,
  details: Record<string, string | null> = {},
) {
  const next = new URLSearchParams();
  for (const key of [...SHARED_KEYS, ...DETAIL_KEYS]) {
    const v = params.get(key);
    if (v) next.set(key, v);
  }
  const destination = path.split("/")[1];
  const controls =
    destination === "sales"
      ? ["metric", "groupBy", "measure", "others"]
      : destination === "stock"
        ? ["classification", "ownership", "supplierId", "groupBy"]
        : destination === "repricing"
          ? ["classification", "ownership", "supplierId"]
          : destination === "reordering"
            ? ["mode", "ownership", "supplierId"]
            : [];
  for (const key of controls) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  for (const [key, v] of Object.entries(details)) {
    if (v === null) next.delete(key);
    else next.set(key, v);
  }
  return next.size ? `${path}?${next}` : path;
}

export function applyMerchandisingFilters(
  params: URLSearchParams,
  filters: MerchandisingFilters,
  now = new Date(),
) {
  const next = new URLSearchParams(params);
  const previous = readMerchandisingFilters(params, now);
  for (const key of [
    "page",
    "channelPage",
    "brandPage",
    "categoryPage",
    "categorySort",
    "categoryDirection",
    "others",
    "sort",
    "direction",
    "search",
  ])
    next.delete(key);
  if (
    previous.dateFrom !== filters.dateFrom ||
    previous.dateTo !== filters.dateTo
  )
    next.delete("snapshotId");
  next.set("period", filters.period);
  next.set("dateFrom", filters.dateFrom);
  next.set("dateTo", filters.dateTo);
  if (filters.channelId) next.set("channelId", filters.channelId);
  else next.delete("channelId");
  readMerchandisingFilters(next, now);
  return next;
}

export function applyMerchandisingSelection(
  params: URLSearchParams,
  draft: MerchandisingFilters,
  anchor: string,
  now = new Date(),
) {
  const period =
    draft.period === "custom" ? null : presetPeriod(draft.period, anchor, now);
  const filters = period
    ? { ...draft, dateFrom: period.from, dateTo: period.to }
    : draft;
  return {
    query: applyMerchandisingFilters(params, filters, now),
    appliedAt: now.toISOString(),
  };
}

export function merchandisingGroup(
  params: URLSearchParams,
  monobrand: boolean,
) {
  const group = params.get("groupBy");
  if (
    group === "sku" ||
    group === "category" ||
    (!monobrand && group === "brand")
  )
    return group;
  return monobrand ? "category" : "brand";
}
