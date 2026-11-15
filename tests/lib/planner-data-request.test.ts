import { beforeEach, expect, it, vi } from "vitest";
import { fetchPlannerItems, fetchPlannerBrands, fetchPlannerCatalogs, fetchPlannerDuplicates } from "@/lib/client/planner-data-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("encodes filters and forwards cancellation through the authenticated wrapper", async () => {
  const signal = new AbortController().signal;
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json([]));
  await fetchPlannerItems({ brandId: "b&1", category: "Shoes", search: "SKU 1" }, signal);
  expect(apiFetch).toHaveBeenCalledWith("/api/planner/items?brandId=b%261&category=Shoes&search=SKU+1", { signal, cache: "no-store" });
});
it.each([fetchPlannerBrands, fetchPlannerCatalogs, fetchPlannerDuplicates])("loads the expected array endpoint", async load => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json([]));
  expect(await load(new AbortController().signal)).toEqual([]);
});
it.each([{ body: {}, status: 200 }, { body: { error: "Denied" }, status: 403 }, { body: null, status: 200 }])("rejects HTTP errors and non-array responses: $body", async ({ body, status }) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(body, { status }));
  await expect(fetchPlannerCatalogs(new AbortController().signal)).rejects.toThrow();
});
it("rejects malformed JSON and malformed duplicate groups", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("<html>bad response</html>"));
  await expect(fetchPlannerBrands(new AbortController().signal)).rejects.toThrow();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json([{}]));
  await expect(fetchPlannerDuplicates(new AbortController().signal)).rejects.toThrow("PLANNER_DATA_INVALID_RESPONSE");
});
it("removes empty duplicate groups before counting or displaying them", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json([[], [{ id: "i" }], []]));
  expect(await fetchPlannerDuplicates(new AbortController().signal)).toEqual([[{ id: "i" }]]);
});
