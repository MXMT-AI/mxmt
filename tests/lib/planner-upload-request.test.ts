import { beforeEach, expect, it, vi } from "vitest";
import { uploadPlannerCatalog } from "@/lib/client/planner-upload-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const file = new File(["SKU"], "catalog.csv");
beforeEach(() => vi.clearAllMocks());
it("uses authenticated multipart upload and returns the verified row count", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ itemCount: 12 }));
  expect(await uploadPlannerCatalog(file, "brand", "SS26")).toBe(12);
  const [path, init] = vi.mocked(apiFetch).mock.calls[0];
  expect(path).toBe("/api/planner/catalogs/upload");
  expect(init!.method).toBe("POST");
  expect(init!.headers).toBeUndefined();
  const body = init!.body as FormData;
  expect((body.get("file") as File).name).toBe("catalog.csv");
  expect(body.get("brandId")).toBe("brand");
  expect(body.get("season")).toBe("SS26");
});
it.each([
  { body: { error: "Denied" }, status: 403 },
  { body: {}, status: 200 }, { body: { itemCount: "12" }, status: 200 },
  { body: { itemCount: -1 }, status: 200 }, { body: { itemCount: 1.5 }, status: 200 },
  { body: null, status: 200 },
])("rejects failed or malformed replies: $body", async ({ body, status }) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(body, { status }));
  await expect(uploadPlannerCatalog(file, "brand", "SS26")).rejects.toThrow("PLANNER_CATALOG_UPLOAD_FAILED");
});
it("rejects invalid JSON and network failure", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("<html>unavailable</html>"));
  await expect(uploadPlannerCatalog(file, "brand", "SS26")).rejects.toThrow();
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Network failed"));
  await expect(uploadPlannerCatalog(file, "brand", "SS26")).rejects.toThrow();
});
