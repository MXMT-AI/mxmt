"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { isRecord } from "@/lib/api-contracts";
import { calendarChipTypes } from "./calendar-chip-types";
import type { AiPlanChip } from "./calendar-types";

function isPlanChip(value: unknown): value is AiPlanChip {
  return isRecord(value)
    && typeof value.weekKey === "string"
    && typeof value.rowKey === "string"
    && typeof value.label === "string"
    && typeof value.type === "string"
    && Object.hasOwn(calendarChipTypes, value.type);
}

export function useCalendarAiPlan() {
  const [aiChips, setAiChips] = useState<AiPlanChip[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const inFlight = useRef(false);

  async function generate() {
    if (inFlight.current) return false;
    inFlight.current = true;
    setAiLoading(true);
    setAiError(false);
    try {
      const response = await apiFetch("/api/calendar/ai-plan", { method: "POST" });
      if (!response.ok) throw new Error("CALENDAR_AI_REQUEST_FAILED");
      const data: unknown = await response.json();
      if (!isRecord(data) || data.error || !Array.isArray(data.chips) || !data.chips.every(isPlanChip)) {
        throw new Error("CALENDAR_AI_INVALID_RESPONSE");
      }
      setAiChips(data.chips);
      return data.chips.length > 0;
    } catch {
      setAiError(true);
      return false;
    } finally {
      inFlight.current = false;
      setAiLoading(false);
    }
  }

  return { aiChips, aiLoading, aiError, generate };
}
