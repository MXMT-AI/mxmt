import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import type { Lang } from "@/lib/translations";
import type { AiMessage } from "@/components/planner/planner-types";

export async function requestPlannerAi(body: { locale: Lang; systemPrompt: string; messages: AiMessage[] }) {
  const response = await apiFetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readApiJson<{ content?: unknown; error?: unknown }>(response);
  if (!response.ok || !data || data.error || typeof data.content !== "string" || !data.content.trim()) {
    throw new Error("PLANNER_AI_REQUEST_FAILED");
  }
  return data.content;
}
