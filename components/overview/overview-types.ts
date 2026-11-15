import type { OverviewModel } from "@/lib/merchandising-overview";

export type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";

export type CurrencyBlock = OverviewModel["byCurrency"][number];
export type OverviewLink = (path: string, detail?: Record<string, string | null>) => string;
export type OverviewFormatters = {
  money: (value: string | null | undefined) => string;
  pct: (value: string | null | undefined) => string;
  num: (value: string | number | null | undefined) => string;
  date: (value: string) => string;
};
