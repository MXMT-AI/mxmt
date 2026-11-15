import { apiFetch } from "@/lib/fetch";
import type { Brand, CatalogUpload, CatalogItem } from "@/components/planner/planner-types";

export interface PlannerCatalogFilters { brandId: string; category: string; search: string }

async function readPlannerArray<T>(path: string, signal: AbortSignal): Promise<T[]> {
  const response = await apiFetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("PLANNER_DATA_REQUEST_FAILED");
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("PLANNER_DATA_INVALID_RESPONSE");
  return data as T[];
}

export function fetchPlannerItems(filters: PlannerCatalogFilters, signal: AbortSignal) {
  return readPlannerArray<CatalogItem>(`/api/planner/items?${new URLSearchParams({ ...filters })}`, signal);
}
export function fetchPlannerBrands(signal: AbortSignal) {
  return readPlannerArray<Brand>("/api/planner/brands", signal);
}
export function fetchPlannerCatalogs(signal: AbortSignal) {
  return readPlannerArray<CatalogUpload>("/api/planner/catalogs", signal);
}
export async function fetchPlannerDuplicates(signal: AbortSignal) {
  const groups = await readPlannerArray<CatalogItem[]>("/api/planner/duplicates", signal);
  if (!groups.every(Array.isArray)) throw new Error("PLANNER_DATA_INVALID_RESPONSE");
  return groups.filter(group => group.length > 0);
}
