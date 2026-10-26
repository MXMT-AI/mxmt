"use client";
import type { MerchandisingFilters } from "@/lib/merchandising-navigation";
import { useMerchandisingScreen } from "@/components/merchandising/useMerchandisingScreen";
export type { OverviewResponse } from "@/components/merchandising/useMerchandisingScreen";
/** Retain the Overview API while sharing snapshot loading and stale-request protection. */
export function useOverview(filters: MerchandisingFilters) {
  return useMerchandisingScreen(filters, "overview");
}
