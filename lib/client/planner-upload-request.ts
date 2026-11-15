import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";

export async function uploadPlannerCatalog(file: File, brandId: string, season: string) {
  const body = new FormData();
  body.append("file", file);
  body.append("brandId", brandId);
  body.append("season", season);
  const response = await apiFetch("/api/planner/catalogs/upload", { method: "POST", body });
  const data = await readApiJson<{ itemCount?: unknown; error?: unknown }>(response);
  if (!response.ok || !data || data.error || typeof data.itemCount !== "number" || !Number.isSafeInteger(data.itemCount) || data.itemCount < 0) {
    throw new Error("PLANNER_CATALOG_UPLOAD_FAILED");
  }
  return data.itemCount;
}
