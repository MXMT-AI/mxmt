"use client";
import { useEffect, useRef, useState } from "react";
import { postScenario, scenarioFailure, type ScenarioFailure } from "@/lib/client/scenario-preview-request";
import { LatestScenarioRequest } from "@/lib/scenario-preview";
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
