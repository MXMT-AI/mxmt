"use client";

import { useEffect, useState } from "react";
import { fetchImportIssues, type ImportIssuesResult } from "@/lib/client/import-issues-request";

export function useImportIssues({ open, page, code, revision }: {
  open: boolean;
  page: number;
  code: string;
  revision: number;
}) {
  const [data, setData] = useState<ImportIssuesResult | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetchImportIssues(page, code, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, page, code, revision, retry]);

  return { data, error, loading, retry: () => setRetry(value => value + 1) };
}
