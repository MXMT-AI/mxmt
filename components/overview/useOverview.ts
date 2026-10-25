"use client";
import type { MerchandisingFilters } from "@/lib/merchandising-navigation";
import { useMerchandisingScreen } from "@/components/merchandising/useMerchandisingScreen";
export type { OverviewResponse } from "@/components/merchandising/useMerchandisingScreen";
export function useOverview(filters: MerchandisingFilters) {
  return useMerchandisingScreen(filters, "overview");
}
