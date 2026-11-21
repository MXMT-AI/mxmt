"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { buildScreenSelection, buildScreenReadParams } from "@/lib/client/merchandising-screen-request";
import type { WorkspaceFilters } from "./merchandising-shell/merchandising-shell";
import type { MvpScreen } from "@/lib/merchandising-navigation";
import type { getMerchandisingScreen } from "@/lib/merchandising-screen";
export type OverviewResponse = Awaited<
  ReturnType<typeof getMerchandisingScreen>
> & { publishedAt?: string };

export function useMerchandisingScreen(
  filters: WorkspaceFilters,
  screen: MvpScreen,
  controls: Record<string, string> = {},
) {
  const params = useSearchParams(),
    router = useRouter();
  const selection = buildScreenSelection(filters, screen, params, controls);
  const signature = selection.toString(),
    urlSnapshotId = params.get("snapshotId"),
    snapshotId = urlSnapshotId ?? filters.publishedSnapshotId ?? null,
    publishAllowed = Boolean(filters.publishAllowed),
    publishedVersion = filters.publishedVersion;
  const [result, setResult] = useState<{
    signature: string;
    data: OverviewResponse;
  } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [busy, setBusy] = useState(true),
    [reload, setReload] = useState(0);
  const force = useRef(false),
    loaded = useRef("");
  const queryString = params.toString();
  const requestKey = JSON.stringify([screen, signature, snapshotId, publishedVersion, reload]);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const refresh = force.current;
    force.current = false;
    const source = new URLSearchParams(signature);
    const readParams = buildScreenReadParams(screen, source, snapshotId);
    const loadKey = () => JSON.stringify([signature, publishedVersion, readParams.toString()]);
    if (
      !refresh &&
      snapshotId &&
      loaded.current === loadKey()
    )
      return;
    setBusy(true);
    setFailure(null);
    async function load() {
      let id = snapshotId;
      if (!id || refresh) {
        const created = await apiFetch("/api/merchandising/snapshots", {
          method: "POST",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateFrom: source.get("dateFrom"),
            dateTo: source.get("dateTo"),
            ...(refresh && publishAllowed ? { publish: true } : {}),
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
      if (signal.aborted) return;
      if (typeof id !== "string" || !id) throw new Error("SCREEN_DATA_UNAVAILABLE");
      readParams.set("snapshotId", id);
      const response = await apiFetch(
        `/api/merchandising/${screen}?${readParams}`,
        { signal, cache: "no-store" },
      );
      const data = await readApiJson<OverviewResponse & { code?: string }>(
        response,
      );
      if (!response.ok) throw new Error(data.code ?? "SCREEN_DATA_UNAVAILABLE");
      if (
        data.context.snapshotId !== id ||
        data.context.period.from !== source.get("dateFrom") ||
        data.context.period.to !== source.get("dateTo") ||
        (source.has("asOf") && data.context.asOf !== source.get("asOf"))
      )
        throw new Error("SCREEN_SELECTION_MISMATCH");
      if (signal.aborted) return;
      loaded.current = loadKey();
      setResult({ signature, data });
      setBusy(false);
      if (id !== urlSnapshotId) {
        const next = new URLSearchParams(queryString);
        next.set("period", filters.period);
        next.set("snapshotId", id);
        next.set("dateFrom", data.context.period.from);
        next.set("dateTo", data.context.period.to);
        if (data.publishedAt || (refresh && publishAllowed)) next.set("asOf", data.context.asOf);
        router.replace(`/${screen}?${next}`, { scroll: false });
      }
      if (refresh && publishAllowed) router.refresh();
    }
    load().catch((cause) => {
      if (!signal.aborted) {
        setFailure({
          key: requestKey,
          message: cause instanceof Error ? cause.message : "SCREEN_DATA_UNAVAILABLE",
        });
        setBusy(false);
      }
    });
    return () => controller.abort();
  }, [
    signature,
    snapshotId,
    urlSnapshotId,
    publishAllowed,
    publishedVersion,
    reload,
    router,
    queryString,
    filters.period,
    screen,
    requestKey,
  ]);
  const visible =
    result?.signature === signature &&
    (!snapshotId || result.data.context.snapshotId === snapshotId)
      ? result.data
      : null;
  return {
    data: visible,
    error: failure?.key === requestKey ? failure.message : "",
    busy,
    refresh: () => {
      if (publishAllowed && (force.current || (busy && visible))) return;
      force.current = true;
      loaded.current = "";
      setReload((n) => n + 1);
    },
  };
}
