"use client";
import { useCallback, useRef, useState } from "react";
import { requestScenarioExport } from "@/lib/client/scenario-export-request";
import { useExportHistory } from "./use-export-history";
import { ExportAttempt } from "@/lib/scenario-export-client";
import type {
  ExportKind,
  ScenarioExportReceipt,
} from "@/lib/scenario-export-contract";
export function useScenarioExport(kind: ExportKind) {
  const [receipt, setReceipt] = useState<ScenarioExportReceipt | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { history, historyError, reloadHistory } = useExportHistory(kind);
  const attempt = useRef<ExportAttempt | null>(null),
    lock = useRef(false);
  if (!attempt.current) attempt.current = new ExportAttempt();
  const prepare = useCallback(
    async (
      previewId: string,
      scenario: object,
      target?: { supplierId: string; currency: string },
    ) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError("");
      const key = JSON.stringify([kind, previewId, target ?? null]);
      try {
        const exportId = attempt.current!.id(key, () => crypto.randomUUID());
        const body = await requestScenarioExport({
          exportId, kind, previewId, scenario,
          ...(target ? { target } : {}),
        });
        setReceipt(body);
        attempt.current!.complete(key);
        reloadHistory();
      } catch (error) {
        setError(error instanceof Error ? error.message : "EXPORT_FAILED");
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [kind, reloadHistory],
  );
  return {
    receipt,
    busy,
    error,
    history,
    historyError,
    prepare,
    reloadHistory,
  };
}
