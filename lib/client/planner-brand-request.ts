import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { Brand } from "@/components/planner/planner-types";

export type PlannerBrandInput = Pick<Brand, "name" | "budget" | "paymentDays" | "currency" | "country" | "contact" | "leadTimeDays" | "moq">;

export class PlannerBrandRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function mutateBrand(path: string, method: "POST" | "PUT" | "DELETE", input?: PlannerBrandInput) {
  const response = await apiFetch(path, {
    method,
    ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
  });
  const body = await readApiJson<{ id?: unknown; ok?: unknown; error?: unknown; code?: unknown }>(response);
  if (!response.ok || !body || body.error) {
    throw new PlannerBrandRequestError(typeof body?.code === "string" ? body.code : response.status === 403 ? "FORBIDDEN" : "PLANNER_BRAND_REQUEST_FAILED");
  }
  if (method === "DELETE" ? body.ok !== true : typeof body.id !== "string") {
    throw new PlannerBrandRequestError("PLANNER_BRAND_REQUEST_FAILED");
  }
}

export function savePlannerBrand(id: string | null, input: PlannerBrandInput) {
  return mutateBrand(id ? `/api/planner/brands/${encodeURIComponent(id)}` : "/api/planner/brands", id ? "PUT" : "POST", input);
}

export function deletePlannerBrand(id: string) {
  return mutateBrand(`/api/planner/brands/${encodeURIComponent(id)}`, "DELETE");
}
