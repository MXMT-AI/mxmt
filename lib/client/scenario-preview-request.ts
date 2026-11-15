import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";

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
