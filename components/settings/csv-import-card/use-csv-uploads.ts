"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCsvUploads, type CsvUploadsResponse } from "@/lib/client/csv-import-request";

export function useCsvUploads(canManage: boolean, {
  onLoaded,
  onInitialError,
}: {
  onLoaded: (data: CsvUploadsResponse) => void;
  onInitialError: () => void;
}) {
  const [data, setData] = useState<CsvUploadsResponse | null>(null);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (!canManage || !active.current) return;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const next = await fetchCsvUploads(request.signal);
      if (!request.signal.aborted && active.current) {
        setData(next);
        onLoaded(next);
      }
    } catch (error) {
      if (!request.signal.aborted && active.current) throw error;
    }
  }, [canManage, onLoaded]);

  useEffect(() => {
    active.current = true;
    void reload().catch(() => {
      if (active.current) onInitialError();
    });
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, [reload, onInitialError]);

  return {
    source: canManage ? data?.source ?? null : null,
    uploads: canManage ? data?.uploads ?? [] : [],
    suppliers: canManage ? data?.suppliers ?? [] : [],
    reload,
  };
}
