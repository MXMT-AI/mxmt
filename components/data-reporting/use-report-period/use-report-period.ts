"use client";

import { useCallback, useRef, useState } from "react";
import { currentKyivMonth } from "@/lib/data-reporting-ui";

export function useReportPeriod() {
  const [dateFrom, updateDateFrom] = useState("");
  const [dateTo, updateDateTo] = useState("");
  const initialized = useRef(false);
  const edited = useRef({ dateFrom: false, dateTo: false });

  const initializePeriod = useCallback((calculation?: { dateFrom: string; dateTo: string } | null) => {
    if (initialized.current) return;
    initialized.current = true;
    const initial = calculation
      ? { dateFrom: calculation.dateFrom.slice(0, 10), dateTo: calculation.dateTo.slice(0, 10) }
      : currentKyivMonth();
    if (!edited.current.dateFrom) updateDateFrom(initial.dateFrom);
    if (!edited.current.dateTo) updateDateTo(initial.dateTo);
  }, []);

  function setDateFrom(value: string) {
    edited.current.dateFrom = true;
    updateDateFrom(value);
  }

  function setDateTo(value: string) {
    edited.current.dateTo = true;
    updateDateTo(value);
  }

  return { dateFrom, dateTo, setDateFrom, setDateTo, initializePeriod };
}
