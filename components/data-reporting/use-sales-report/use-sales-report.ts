"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { validateReportPeriod } from "@/lib/data-reporting-ui";
import type { SalesView } from "@/lib/sales-report-view";
import type { SalesReportData } from "../sales-reporting-workspace/sales-report-types";

type Period = { from: string; to: string };
type Result = { key: string; data: SalesReportData | null; error: string };

export function useSalesReport({ view, page, search, sort, direction, locale }: {
  view: SalesView;
  page: number;
  search: string;
  sort: string;
  direction: "asc" | "desc";
  locale: Locale;
}) {
  const [period, setPeriod] = useState<Period>({ from: "", to: "" });
  const [applied, setApplied] = useState<Period>({ from: "", to: "" });
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [validation, setValidation] = useState<{ key: string; error: string } | null>(null);
  const snapshot = useRef<string | null>(null);
  const revision = useRef(0);
  const query = new URLSearchParams({ view, q: search, sort, direction }).toString();
  const { from, to } = applied;
  const key = JSON.stringify([query, page, from, to, reload]);

  useEffect(() => {
    const controller = new AbortController();
    const requestRevision = revision.current;
    const currentRequest = () => !controller.signal.aborted && revision.current === requestRevision;
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    if (snapshot.current) params.set("calculationRunId", snapshot.current);
    else if (from || to) {
      params.set("dateFrom", from);
      params.set("dateTo", to);
    }

    async function load() {
      try {
        const response = await apiFetch(`/api/data/sales?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await readApiJson<SalesReportData & { code?: string }>(response);
        if (!response.ok) throw new Error(body.code ?? "UNAVAILABLE");
        if (!currentRequest()) return;

        snapshot.current = body.calculationRunId;
        setPeriod({ from: body.period.from, to: body.period.to });
        setResult({ key, data: body, error: "" });
      } catch (cause) {
        if (currentRequest()) {
          setResult({ key, data: null, error: cause instanceof Error ? cause.message : "UNAVAILABLE" });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [key, query, page, from, to]);

  function refresh() {
    snapshot.current = null;
    revision.current++;
    setReload(revision.current);
  }

  function applyPeriod() {
    if (validateReportPeriod(period.from, period.to)) {
      setValidation({ key, error: "INVALID_REPORT_PERIOD" });
      return false;
    }
    setValidation(null);
    setApplied({ ...period });
    refresh();
    return true;
  }

  const current = result?.key === key ? result : null;
  const error = validation?.key === key ? validation.error : current?.error ?? "";
  const data = current?.data ?? null;
  let exportHref: string | null = null;
  if (data) {
    const exportParams = new URLSearchParams(query);
    exportParams.set("calculationRunId", data.calculationRunId);
    exportParams.set("format", "csv");
    exportParams.set("locale", locale);
    exportHref = `/api/data/sales?${exportParams}`;
  }

  return {
    data,
    error,
    busy: current === null,
    period,
    setPeriod,
    applyPeriod,
    refresh,
    exportHref,
  };
}
