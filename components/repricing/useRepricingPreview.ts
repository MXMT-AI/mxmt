"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { LatestRepricingRequest } from "@/lib/repricing-workspace";
import type {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import type { RepricingRequest } from "@/lib/repricing-contract";
export type RepricingInputResponse = Awaited<
  ReturnType<typeof createRepricingInputs>
>;
export type RepricingPreview = Awaited<ReturnType<typeof getRepricingPreview>>;
export type RepricingFailure = { code: string; details: string[] };
async function post<T extends Record<string, unknown>>(
  path: string,
  body: unknown,
  signal: AbortSignal,
) {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const data = await readApiJson<T & { code?: string; details?: string[] }>(
    response,
  );
  if (!response.ok || !data || data.error)
    throw {
      code: data?.code ?? "SCREEN_DATA_UNAVAILABLE",
      details: data?.details ?? [],
    };
  return data;
}
const failure = (error: unknown): RepricingFailure =>
  typeof error === "object" && error !== null && "code" in error
    ? (error as RepricingFailure)
    : { code: "SCREEN_DATA_UNAVAILABLE", details: [] };
export function useRepricingInputs(snapshotId: string) {
  const [result, setResult] = useState<{
      snapshotId: string;
      data: RepricingInputResponse;
    } | null>(null),
    [error, setError] = useState<RepricingFailure | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    post<RepricingInputResponse>(
      "/api/merchandising/repricing/inputs",
      { snapshotId },
      controller.signal,
    )
      .then((data) => {
        if (
          typeof data.inputSetId !== "string" ||
          data.snapshotId !== snapshotId ||
          typeof data.context?.asOf !== "string"
        )
          throw new Error("Invalid input response");
        if (!controller.signal.aborted) setResult({ snapshotId, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(failure(error));
      });
    return () => controller.abort();
  }, [snapshotId, retry]);
  return {
    data: result?.snapshotId === snapshotId ? result.data : null,
    error,
    retry: () => {
      setError(null);
      setRetry((n) => n + 1);
    },
  };
}
/** Debounce server previews and fence responses before exposing any new rows or totals. */
export function useRepricingPreview(
  request: Omit<RepricingRequest, "inputSetId"> & { inputSetId: string | null },
) {
  const key = JSON.stringify(request),
    controls = JSON.stringify([
      request.inputSetId,
      request.parameters,
      request.filters,
    ]),
    latest = useRef<LatestRepricingRequest | null>(null);
  if (!latest.current) latest.current = new LatestRepricingRequest();
  const [result, setResult] = useState<{
      key: string;
      controls: string;
      data: RepricingPreview;
    } | null>(null),
    [error, setError] = useState<{
      key: string;
      error: RepricingFailure;
    } | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!request.inputSetId) {
      latest.current!.cancel();
      return;
    }
    return latest.current!.schedule(
      async (signal) => {
        const data = await post<RepricingPreview>(
          "/api/merchandising/repricing/preview",
          JSON.parse(key),
          signal,
        );
        if (
          typeof data.previewId !== "string" ||
          data.inputSetId !== request.inputSetId
        )
          throw new Error("Invalid preview response");
        return data;
      },
      (data) => setResult({ key, controls, data }),
      (error) => setError({ key, error: failure(error) }),
    );
  }, [key, request.inputSetId, retry]);
  const current = result?.key === key;
  return {
    data: result?.data ?? null,
    sameControls: result?.controls === controls,
    current,
    busy: !current && error?.key !== key,
    error: error?.key === key ? error.error : null,
    retry: () => {
      setError(null);
      setRetry((n) => n + 1);
    },
  };
}
