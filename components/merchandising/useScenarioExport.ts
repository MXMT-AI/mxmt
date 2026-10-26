"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { ExportAttempt } from "@/lib/scenario-export-client";
import type {
  ExportKind,
  ScenarioExportReceipt,
} from "@/lib/scenario-export-contract";
/** Keep retry identity across uncertain POST responses, and load only bounded audit metadata. */
export function useScenarioExport(kind: ExportKind) {
  const [receipt, setReceipt] = useState<ScenarioExportReceipt | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<ScenarioExportReceipt[]>([]),
    [historyError, setHistoryError] = useState(false),
    [reload, setReload] = useState(0);
  const attempt = useRef<ExportAttempt | null>(null),
    lock = useRef(false);
  if (!attempt.current) attempt.current = new ExportAttempt();
  useEffect(() => {
    const controller = new AbortController();
    setHistoryError(false);
    apiFetch(`/api/merchandising/exports?kind=${kind}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await readApiJson<{ rows?: ScenarioExportReceipt[] }>(
          response,
        );
        if (!response.ok || !Array.isArray(body.rows)) throw new Error();
        if (!controller.signal.aborted) setHistory(body.rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistoryError(true);
      });
    return () => controller.abort();
  }, [kind, reload]);
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
        const response = await apiFetch("/api/merchandising/exports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exportId,
            kind,
            previewId,
            scenario,
            ...(target ? { target } : {}),
          }),
        });
        const body = await readApiJson<
          ScenarioExportReceipt & { code?: string } & Record<string, unknown>
        >(response);
        if (
          !response.ok ||
          body.exportId !== exportId ||
          !Array.isArray(body.files)
        )
          throw new Error(body.code ?? "EXPORT_FAILED");
        setReceipt(body);
        attempt.current!.complete(key);
        setReload((n) => n + 1);
      } catch (error) {
        setError(error instanceof Error ? error.message : "EXPORT_FAILED");
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [kind],
  );
  return {
    receipt,
    busy,
    error,
    history,
    historyError,
    prepare,
    reloadHistory: () => setReload((n) => n + 1),
  };
}
