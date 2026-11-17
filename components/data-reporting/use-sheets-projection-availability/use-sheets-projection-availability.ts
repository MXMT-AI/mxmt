"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { selectedSheetsProjectionIntent } from "@/lib/client/sheets-reporting";

export function useSheetsProjectionAvailability(enabled: boolean, reloadVersion: number) {
  const key = `${enabled}:${reloadVersion}`;
  const [result, setResult] = useState<{ key: string; available: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void selectedSheetsProjectionIntent((path, init) =>
      apiFetch(path, { ...init, cache: "no-store", signal: controller.signal }),
    ).then(intent => {
      if (!controller.signal.aborted) setResult({ key, available: intent !== null });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, available: false });
    });
    return () => controller.abort();
  }, [enabled, key]);

  return enabled && result?.key === key && result.available;
}
