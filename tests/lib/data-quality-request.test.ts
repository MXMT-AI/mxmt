import { beforeEach, expect, it, vi } from "vitest";
import { fetchDataQuality } from "@/lib/client/data-quality-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it("encodes query values and preserves cache/cancellation options", async () => {
  const result = { rows: [], summary: [] };
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(result));
  const signal = new AbortController().signal;
  expect(await fetchDataQuality({ page: 3, search: "SKU & name", code: "MISSING_COST" }, signal)).toEqual(result);
  expect(apiFetch).toHaveBeenCalledWith("/api/data/quality?page=3&q=SKU%20%26%20name&code=MISSING_COST", { signal, cache: "no-store" });
});
it.each([Response.json({ rows: [] }, { status: 403 }), Response.json({ rows: null }), new Response("not-json", { status: 500 })])("rejects failed or malformed responses", async response => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response);
  await expect(fetchDataQuality({ page: 1, search: "", code: "" })).rejects.toThrow("QUALITY_UNAVAILABLE");
});

it("sends typed alias and product-kind changes and rejects failed saves", async () => {
  const { saveDataQuality } = await import("@/lib/client/data-quality-request");
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ok: true }));
  const change = { action: "alias" as const, alias: "Demo", brandId: null };
  await saveDataQuality(change);
  expect(apiFetch).toHaveBeenCalledWith("/api/data/quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(saveDataQuality({ action: "productKind", skuId: "p", productKind: "SERVICE" })).rejects.toThrow("SAVE_FAILED");
});
