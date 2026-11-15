import { beforeEach, expect, it, vi } from "vitest";
import { savePlannerBrand, deletePlannerBrand, PlannerBrandRequestError, type PlannerBrandInput } from "@/lib/client/planner-brand-request";
import { apiFetch } from "@/lib/fetch";
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const input: PlannerBrandInput = { name: "Demo", budget: 100, paymentDays: 30, currency: "EUR", country: null, contact: null, leadTimeDays: 28, moq: 1 };
beforeEach(() => vi.clearAllMocks());
it.each([null, "brand"]) ("uses POST or PUT according to brand identity: %s", async id => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ id: "brand" }));
  await savePlannerBrand(id, input);
  expect(apiFetch).toHaveBeenCalledWith(id ? "/api/planner/brands/brand" : "/api/planner/brands", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
});
it("deletes through the authenticated wrapper", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ok: true }));
  await deletePlannerBrand("brand");
  expect(apiFetch).toHaveBeenCalledWith("/api/planner/brands/brand", { method: "DELETE" });
});
it.each(["BRAND_ALREADY_EXISTS", "FORBIDDEN", "BRAND_HAS_ALIASES"])("retains the server error code %s", async code => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ code, error: "Rejected" }, { status: 409 }));
  await expect(savePlannerBrand("brand", input)).rejects.toMatchObject({ code });
});
it("rejects malformed success data and non-JSON errors", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}));
  await expect(savePlannerBrand(null, input)).rejects.toBeInstanceOf(PlannerBrandRequestError);
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("<html>Forbidden</html>", { status: 403 }));
  await expect(deletePlannerBrand("brand")).rejects.toMatchObject({ code: "FORBIDDEN" });
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ok: false }));
  await expect(deletePlannerBrand("brand")).rejects.toMatchObject({ code: "PLANNER_BRAND_REQUEST_FAILED" });
});
