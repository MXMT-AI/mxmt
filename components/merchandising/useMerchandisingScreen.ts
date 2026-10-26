"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { MerchandisingFilters } from "@/lib/merchandising-navigation";
import type { getMerchandisingScreen } from "@/lib/merchandising-screen";
export type OverviewResponse = Awaited<
  ReturnType<typeof getMerchandisingScreen>
>;
const FILTER_KEYS = [
  "brandId",
  "categoryId",
  "skuId",
  "currency",
  "channelId",
] as const;

/** Pin a server snapshot into the URL; stale requests cannot replace data for newer filters. */
export function useMerchandisingScreen(
  filters: MerchandisingFilters,
  screen: "overview" | "sales",
  controls: Record<string, string> = {},
) {
  const params = useSearchParams(),
    router = useRouter();
  const selection = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });
  for (const key of ["asOf", ...FILTER_KEYS] as const) {
    const value = params.get(key);
    if (value) selection.set(key, value);
  }
  for (const [key, value] of Object.entries(controls))
    selection.set(key, value);
  const signature = selection.toString(),
    snapshotId = params.get("snapshotId");
  const [result, setResult] = useState<{
    signature: string;
    data: OverviewResponse;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true),
    [reload, setReload] = useState(0);
  const force = useRef(false),
    loaded = useRef("");
  const queryString = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    const refresh = force.current;
    force.current = false;
    const readParams = new URLSearchParams({ snapshotId: snapshotId ?? "" });
    const source = new URLSearchParams(signature);
    for (const key of [
      ...FILTER_KEYS,
      ...(screen === "sales"
        ? ["groupBy", "measure", "metric", "others", "page", "channelPage"]
        : []),
    ]) {
      const value = source.get(key);
      if (value) readParams.set(key, value);
    }
    if (
      !refresh &&
      snapshotId &&
      loaded.current === signature + "|" + readParams.toString()
    )
      return;
    setBusy(true);
    setError("");
    async function load() {
      let id = snapshotId;
      if (!id || refresh) {
        const created = await apiFetch("/api/merchandising/snapshots", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateFrom: source.get("dateFrom"),
            dateTo: source.get("dateTo"),
            ...(source.has("asOf") ? { asOf: source.get("asOf") } : {}),
          }),
        });
        const body = await readApiJson<{ snapshotId: string; code?: string }>(
          created,
        );
        if (!created.ok)
          throw new Error(body.code ?? "SCREEN_DATA_UNAVAILABLE");
        id = body.snapshotId;
      }
      readParams.set("snapshotId", id!);
      const response = await apiFetch(
        `/api/merchandising/${screen}?${readParams}`,
        { signal: controller.signal, cache: "no-store" },
      );
      const data = await readApiJson<OverviewResponse & { code?: string }>(
        response,
      );
      if (!response.ok) throw new Error(data.code ?? "SCREEN_DATA_UNAVAILABLE");
      if (
        data.context.period.from !== source.get("dateFrom") ||
        data.context.period.to !== source.get("dateTo") ||
        (source.has("asOf") && data.context.asOf !== source.get("asOf"))
      )
        throw new Error("SCREEN_SELECTION_MISMATCH");
      if (controller.signal.aborted) return;
      loaded.current = signature + "|" + readParams.toString();
      setResult({ signature, data });
      setBusy(false);
      if (id !== snapshotId) {
        const next = new URLSearchParams(queryString);
        next.set("period", filters.period);
        next.set("snapshotId", id!);
        next.set("dateFrom", data.context.period.from);
        next.set("dateTo", data.context.period.to);
        router.replace(`/${screen}?${next}`, { scroll: false });
      }
    }
    load().catch((cause) => {
      if (!controller.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : "SCREEN_DATA_UNAVAILABLE",
        );
        setBusy(false);
      }
    });
    return () => controller.abort();
  }, [
    signature,
    snapshotId,
    reload,
    router,
    queryString,
    filters.period,
    screen,
  ]);
  const visible =
    result?.signature === signature &&
    (!snapshotId || result.data.context.snapshotId === snapshotId)
      ? result.data
      : null;
  return {
    data: visible,
    error,
    busy,
    refresh: () => {
      force.current = true;
      loaded.current = "";
      setReload((n) => n + 1);
    },
  };
}
