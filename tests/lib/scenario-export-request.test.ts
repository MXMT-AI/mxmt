import { beforeEach, expect, it, vi } from "vitest";
import { fetchExportHistory, requestScenarioExport } from "@/lib/client/scenario-export-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const command = { exportId: "attempt", kind: "reorder" as const, previewId: "preview", scenario: {}, target: { supplierId: "a", currency: "UAH" } };
beforeEach(() => vi.clearAllMocks());
it("posts the full command and returns the matching receipt", async () => {
  const receipt = { exportId: "attempt", files: [] };
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(receipt));
  expect(await requestScenarioExport(command)).toEqual(receipt);
  expect(apiFetch).toHaveBeenCalledWith("/api/merchandising/exports", expect.objectContaining({ method: "POST", body: JSON.stringify(command) }));
});
it.each([
  [{ exportId: "other", files: [] }, 200, "EXPORT_FAILED"],
  [{ exportId: "attempt" }, 200, "EXPORT_FAILED"],
  [{ code: "FORBIDDEN" }, 403, "FORBIDDEN"],
] as const)("rejects invalid or failed export responses: %j", async (body, status, code) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(body, { status }));
  await expect(requestScenarioExport(command)).rejects.toThrow(code);
});
it("loads only the requested export kind with cancellation", async () => {
  const signal = new AbortController().signal;
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ rows: [] }));
  expect(await fetchExportHistory("reprice", signal)).toEqual([]);
  expect(apiFetch).toHaveBeenCalledWith("/api/merchandising/exports?kind=reprice", { signal, cache: "no-store" });
});
it("rejects malformed history", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ rows: "invalid" }));
  await expect(fetchExportHistory("reorder", new AbortController().signal)).rejects.toThrow();
});
