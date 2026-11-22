"use client";

import { useEffect, useState } from "react";
import type { DataTableResponse } from "@/lib/data-table-api";
import type { DataTableKey, InitialTablePreference } from "@/lib/data-table-preferences";
import { responseMessage } from "@/lib/client/data-reporting-response";
import { apiFetch } from "@/lib/fetch";
import { dataReportingUseReportTableMessages as englishCopy } from "@/messages/en.json";

type TableResult = {
  key: string;
  table: DataTableResponse | null;
  error: string | null;
};

export function useReportTable({ activeTab, page, preference, reloadVersion, search, onPageChange }: {
  activeTab: DataTableKey;
  page: number;
  preference: InitialTablePreference;
  reloadVersion: number;
  search: string;
  onPageChange: (page: number) => void;
}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(preference.pageSize),
    direction: preference.sortDirection,
  });
  if (search) params.set("search", search);
  if (preference.sortColumn) params.set("sort", preference.sortColumn);
  const url = `/api/data/tables/${activeTab}?${params}`;
  const key = `${reloadVersion}:${url}`;
  const [result, setResult] = useState<TableResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const response = await apiFetch(url, { cache: "no-store", signal });
        if (!response.ok) throw new Error(await responseMessage(response));
        const table: DataTableResponse = await response.json();
        if (signal.aborted) return;

        setResult({ key, table, error: null });
        if (table.pagination.totalPages > 0 && page > table.pagination.totalPages) {
          onPageChange(table.pagination.totalPages);
        }
      } catch (error) {
        if (!signal.aborted) {
          setResult({ key, table: null, error: error instanceof Error ? error.message : englishCopy.errorCouldNotLoadData });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [url, key, page, onPageChange]);

  const current = result?.key === key ? result : null;
  return { table: current?.table ?? null, error: current?.error ?? null, loading: current === null };
}
