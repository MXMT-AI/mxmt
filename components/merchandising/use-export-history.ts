"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchExportHistory } from "@/lib/client/scenario-export-request";
import type { ExportKind, ScenarioExportReceipt } from "@/lib/scenario-export-contract";

export function useExportHistory(kind: ExportKind) {
  const [history, setHistory] = useState<ScenarioExportReceipt[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(false);
    fetchExportHistory(kind, controller.signal)
      .then(rows => {
        if (!controller.signal.aborted) setHistory(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoryError(true);
      });
    return () => controller.abort();
  }, [kind, reload]);

  const reloadHistory = useCallback(() => setReload(n => n + 1), []);
  return { history, historyError, reloadHistory };
}
