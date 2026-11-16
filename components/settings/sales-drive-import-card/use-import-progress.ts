"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { Lang } from "@/lib/translations";
import type { Progress, ImportResponse } from "./import-types";

export const isImportRunning = (job: Progress | null) =>
  Boolean(job && ["PENDING", "RUNNING", "RETRY"].includes(job.state));

export function useImportProgress({ lang, canManage, resource, generic, onCompleted }: {
  lang: Lang;
  canManage: boolean;
  resource: "orders" | "inventory" | "sync";
  generic: boolean;
  onCompleted?: () => void;
}) {
  const uk = lang === "uk", inventory = resource === "inventory", sync = resource === "sync";
  const endpoint = generic ? `/api/connectors/${sync ? "sync" : inventory ? "inventory" : "import"}`
    : `/api/connectors/salesdrive/${sync ? "sync" : inventory ? "inventory" : "import"}`;
  const [syncInfo, setSyncInfo] = useState<ImportResponse>({});
  const job = syncInfo.job ?? null, coverage = syncInfo.coverage ?? null;
  const [loaded, setLoaded] = useState(false);
  const requestId = useRef(0), actionInFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const applyProgress = useCallback((result: ImportResponse) => {
    setError("");
    setSyncInfo(result);
    setLoaded(true);
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (actionInFlight.current) return;
      const id = ++requestId.current;
      try {
        const response = await apiFetch(endpoint, { signal, cache: "no-store" });
        const result = await readApiJson<ImportResponse>(response);
        if (!response.ok || result.job === undefined) throw new Error("IMPORT_UNAVAILABLE");
        if (!signal?.aborted && id === requestId.current) applyProgress(result);
      } catch (cause) {
        if (!signal?.aborted && id === requestId.current) throw cause;
      }
    },
    [endpoint, applyProgress],
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setError(
          uk
            ? "Не вдалося завантажити прогрес."
            : "Could not load import progress.",
        );
        setLoaded(true);
      }
    });
    return () => controller.abort();
  }, [load, uk]);
  const completedKey = [
    job?.state === "COMPLETE" ? `${job.id}:${job.updatedAt}` : "",
    syncInfo.calculation?.state === "COMPLETE" ? "calculated" : "",
    syncInfo.backfill?.state === "COMPLETE" ? syncInfo.backfill.id : "",
  ].join("|");
  const previousCompleted = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (
      previousCompleted.current !== null &&
      completedKey
        .split("|")
        .some(
          (key) => key && !previousCompleted.current!.split("|").includes(key),
        )
    )
      onCompleted?.();
    previousCompleted.current = completedKey;
  }, [completedKey, onCompleted, loaded]);
  const polling =
    isImportRunning(job) ||
    (sync && Boolean(syncInfo.resources?.some((r) => r.pending > 0)));
  const calculating =
    sync &&
    ["WAITING_ENGINE", "PENDING", "RUNNING", "FAILED"].includes(
      syncInfo.calculation?.state ?? "",
    );
  const watching = polling || calculating;
  useEffect(() => {
    if (!watching) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await load(controller.signal);
      } catch {
        if (!controller.signal.aborted)
          setError(
            uk
              ? "Не вдалося оновити прогрес. Наступна спроба — автоматично."
              : "Could not refresh progress. Retrying automatically.",
          );
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 10_000);
      }
    };
    timer = setTimeout(poll, 10_000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [watching, load, uk]);
  async function act(action: string) {
    if (!canManage || actionInFlight.current) return;
    actionInFlight.current = true;
    requestId.current++;
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await readApiJson<ImportResponse>(response);
      if (!response.ok || result.job === undefined)
        throw new Error(
          result.code === "IMPORT_BUSY"
            ? "IMPORT_BUSY"
            : result.code === "CATALOG_NOT_CONFIGURED"
              ? "CATALOG_NOT_CONFIGURED"
              : "IMPORT_UNAVAILABLE",
        );
      applyProgress(result);
    } catch (error) {
      setError(
        error instanceof Error && error.message === "IMPORT_BUSY"
          ? uk
            ? "Завершіть або відновіть інший імпорт SalesDrive перед запуском цього."
            : "Finish or resume the other SalesDrive import before starting this one."
          : error instanceof Error && error.message === "CATALOG_NOT_CONFIGURED"
            ? uk
              ? generic?"Налаштуйте читання каталогу й залишків у вибраному з’єднанні.":"Збережіть YML-посилання в налаштуваннях SalesDrive перед імпортом каталогу."
              : generic?"Configure catalogue and stock access for the selected connection.":"Save a YML feed URL in SalesDrive settings before importing the catalogue."
            : uk
              ? "Не вдалося виконати дію. Перевірте з’єднання та налаштування джерела."
              : "Import action failed. Check the connection and source settings.",
      );
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }
  return { syncInfo, job, coverage, loaded, busy, error, setError, load, act, polling };
}
