"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { demoInsights, demoStock } from "./calendar-demo-data";
import type { InsightItem, StockItem } from "./calendar-types";

export function useCalendarData() {
  const [stockData, setStockData] = useState<StockItem[]>(demoStock);
  const [insights, setInsights] = useState<InsightItem[]>(demoInsights);

  useEffect(() => {
    const controller = new AbortController();

    async function load<T>(path: string, onLoad: (items: T[]) => void) {
      try {
        const response = await apiFetch(path, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const data: unknown = await response.json();
        if (Array.isArray(data) && !controller.signal.aborted) onLoad(data as T[]);
      } catch {
        // Keep the initial fallback when a request fails or is cancelled.
      }
    }

    void load("/api/calendar/stock", setStockData);
    void load("/api/calendar/insights", setInsights);
    return () => controller.abort();
  }, []);

  return { stockData, insights };
}
