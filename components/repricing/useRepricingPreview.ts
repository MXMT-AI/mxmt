"use client";
import { useEffect, useState } from "react";
import {
  postScenario,
  scenarioFailure,
  useScenarioPreview,
} from "@/components/merchandising/useScenarioPreview";
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
    postScenario<RepricingInputResponse>(
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
        if (!controller.signal.aborted) setError(scenarioFailure(error));
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
/** Reuse the shared transport while retaining the repricing input/reset contract. */
export function useRepricingPreview(
  request: Omit<RepricingRequest, "inputSetId"> & { inputSetId: string | null },
) {
  return useScenarioPreview<RepricingPreview>(
    "/api/merchandising/repricing/preview",
    request.inputSetId ? request : null,
    JSON.stringify([request.inputSetId, request.parameters, request.filters]),
    "inputSetId",
  );
}
