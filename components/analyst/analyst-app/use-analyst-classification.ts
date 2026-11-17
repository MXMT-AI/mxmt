"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { isRecord } from "@/lib/api-contracts";
import type { ClassifiedSku, ClassifySummary } from "@/lib/analyst-types";
import { SKU_FLAGS, type AnalystFilter } from "../sku-flags";

const summaryKeys = ["total", ...Object.keys(SKU_FLAGS)];

export function useAnalystClassification(initialSkus: ClassifiedSku[], initialSummary: ClassifySummary) {
  const [skus, setSkus] = useState(initialSkus);
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const latestRequest = useRef(0);

  useEffect(() => () => { latestRequest.current += 1; }, []);

  async function reload(flag: AnalystFilter) {
    const request = ++latestRequest.current;
    setLoading(true);
    setError(false);
    try {
      const params = flag === "all" ? "" : `?flag=${flag}`;
      const response = await apiFetch(`/api/analyst/classify${params}`);
      if (!response.ok) throw new Error("ANALYST_REQUEST_FAILED");
      const data: unknown = await response.json();
      if (!isRecord(data) || !Array.isArray(data.skus) || !isRecord(data.summary)) {
        throw new Error("ANALYST_INVALID_RESPONSE");
      }
      const nextSummary = data.summary;
      if (!summaryKeys.every(key => typeof nextSummary[key] === "number" && Number.isFinite(nextSummary[key]) && nextSummary[key] >= 0)) {
        throw new Error("ANALYST_INVALID_SUMMARY");
      }
      if (request !== latestRequest.current) return;
      setSkus(data.skus as ClassifiedSku[]);
      setSummary(nextSummary as unknown as ClassifySummary);
    } catch {
      if (request === latestRequest.current) setError(true);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }

  return { skus, summary, loading, error, reload };
}
