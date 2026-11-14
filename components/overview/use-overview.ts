"use client";
import type { MerchandisingFilters } from "@/lib/merchandising-navigation";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
export type { OverviewResponse } from "@/components/merchandising/use-merchandising-screen";
export function useOverview(filters: MerchandisingFilters) {
  return useMerchandisingScreen(filters, "overview");
}
