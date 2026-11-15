import { beforeEach, expect, it, vi } from "vitest";
import { requestPlannerAi } from "@/lib/client/planner-ai-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const body = { locale: "uk" as const, systemPrompt: "context", messages: [{ role: "user" as const, content: "Question" }] };
beforeEach(() => vi.clearAllMocks());
it("sends the existing contract through the authenticated wrapper", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ content: "Answer" }));
  expect(await requestPlannerAi(body)).toBe("Answer");
  expect(apiFetch).toHaveBeenCalledWith("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
});
it.each([
  { data: { error: "Unavailable" }, status: 503 },
  { data: { error: "Failed", content: "Ignored" }, status: 200 },
  { data: {}, status: 200 }, { data: { content: "   " }, status: 200 },
  { data: { content: 12 }, status: 200 }, { data: null, status: 200 },
])("rejects a failed or invalid reply: $data", async ({ data, status }) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(data, { status }));
  await expect(requestPlannerAi(body)).rejects.toThrow("PLANNER_AI_REQUEST_FAILED");
});
it("rejects malformed JSON and network errors", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("<html>bad gateway</html>"));
  await expect(requestPlannerAi(body)).rejects.toThrow("PLANNER_AI_REQUEST_FAILED");
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Network failed"));
  await expect(requestPlannerAi(body)).rejects.toThrow("Network failed");
});
