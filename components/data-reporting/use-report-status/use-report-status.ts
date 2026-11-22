"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { scheduleRawImportStatusCheck } from "@/lib/client/raw-import-status";
import { responseMessage } from "@/lib/client/data-reporting-response";
import { dataReportingUseReportStatusMessages as englishCopy } from "@/messages/en.json";

export interface DataStatus {
  connection: { fileId: string; revision: number } | null;
  configured: boolean;
  source: { name: string; timezone: string; updatedAt: string; driveFileId: string } | null;
  activeImport: { status: string; createdAt?: string; completedAt?: string | null; activatedAt?: string | null; finishedAt?: string | null } | null;
  latestImport: { status: string; createdAt: string; finishedAt?: string | null } | null;
  calculation: {
    status: string;
    dateFrom: string;
    dateTo: string;
    asOfDate: string;
    finishedAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
  } | null;
  issueCounts: Record<string, number>;
}


export function useReportStatus({ reloadVersion, actionPending, onError }: {
  reloadVersion: number;
  actionPending: boolean;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const loadStatus = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setStatusLoading(true);
    try {
      const response = await apiFetch("/api/data/status", { cache: "no-store", signal });
      if (!response.ok) throw new Error(await responseMessage(response));
      const nextStatus = await response.json() as DataStatus;
      if (!signal?.aborted) setStatus(nextStatus);
    } catch (loadError) {
      if (!signal?.aborted && !(loadError instanceof DOMException && loadError.name === "AbortError")) {
        onError(loadError instanceof Error ? loadError.message : englishCopy.couldNotLoadStatus);
        if (quiet) setStatus(current => current ? { ...current } : current);
      }
    } finally {
      if (!quiet && !signal?.aborted) setStatusLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus, reloadVersion]);

  useEffect(() => {
    if (actionPending) return;
    const controller = new AbortController();
    const cancel = scheduleRawImportStatusCheck(
      status?.latestImport ?? null,
      () => { void loadStatus(controller.signal, true); },
      () => setStatus(current => current ? { ...current } : current),
    );
    return () => {
      cancel();
      controller.abort();
    };
  }, [status, actionPending, loadStatus]);

  return { status, statusLoading };
}
