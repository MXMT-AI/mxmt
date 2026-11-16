import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { Quality } from "@/components/settings/data-quality-card/data-quality-types";

export interface DataQualityQuery { page: number; search: string; code: string }

export async function fetchDataQuality({ page, search, code }: DataQualityQuery, signal?: AbortSignal) {
  const response = await apiFetch(`/api/data/quality?page=${page}&q=${encodeURIComponent(search)}&code=${encodeURIComponent(code)}`, { signal, cache: "no-store" });
  const result = await readApiJson<Quality>(response);
  if (!response.ok || !Array.isArray(result.rows)) throw new Error("QUALITY_UNAVAILABLE");
  return result;
}

export type DataQualityChange =
  | { action: "alias"; alias: string; brandId: string | null }
  | { action: "productKind"; skuId: string; productKind: string };

export async function saveDataQuality(change: DataQualityChange) {
  const response = await apiFetch("/api/data/quality", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change),
  });
  if (!response.ok) throw new Error("SAVE_FAILED");
}
