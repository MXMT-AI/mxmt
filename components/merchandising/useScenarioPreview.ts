"use client";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { LatestScenarioRequest } from "@/lib/scenario-preview";
export type ScenarioFailure = { code: string; details: string[] };
export async function postScenario<T extends Record<string, unknown>>(
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
export function scenarioFailure(error: unknown): ScenarioFailure {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    typeof error.code !== "string"
  )
    return { code: "SCREEN_DATA_UNAVAILABLE", details: [] };
  const details =
    "details" in error && Array.isArray(error.details)
      ? error.details.filter((d): d is string => typeof d === "string")
      : [];
  return { code: error.code, details };
}

export function useScenarioPreview<T extends Record<string, unknown>>(
  endpoint: string,
  request: object | null,
  controls: string,
  identity: "snapshotId" | "inputSetId",
) {
  const key = JSON.stringify(request),
    latest = useRef<LatestScenarioRequest | null>(null);
  if (!latest.current) latest.current = new LatestScenarioRequest();
  const [result, setResult] = useState<{
      key: string;
      controls: string;
      data: T;
    } | null>(null),
    [error, setError] = useState<{
      key: string;
      error: ScenarioFailure;
    } | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (key === "null") {
      latest.current!.cancel();
      return;
    }
    const body = JSON.parse(key) as Record<string, unknown>;
    return latest.current!.schedule(
      async (signal) => {
        const data = await postScenario<T>(endpoint, body, signal);
        if (
          typeof data.previewId !== "string" ||
          data[identity] !== body[identity]
        )
          throw new Error("Invalid scenario response");
        return data;
      },
      (data) => setResult({ key, controls, data }),
      (error) => setError({ key, error: scenarioFailure(error) }),
    );
  }, [key, endpoint, identity, retry, controls]);
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
