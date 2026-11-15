"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import type { ReportingSources } from "@/lib/reporting-source-contract";

export function useReportingSourceStatus() {
  const [data, setData] = useState<ReportingSources | null>(null),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError(false);
    apiFetch("/api/connectors/source", {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const body = (await response.json()) as ReportingSources;
        if (!abort.signal.aborted) setData(body);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    const changed = () => setReload((n) => n + 1);
    window.addEventListener("connector-connection-changed", changed);
    return () => {
      abort.abort();
      window.removeEventListener("connector-connection-changed", changed);
    };
  }, [reload]);
  function retry() {
    setReload(n => n + 1);
  }

  return { data, error, retry };
}
