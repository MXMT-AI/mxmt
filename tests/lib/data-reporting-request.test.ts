import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { postDataReportingAction } from "@/lib/client/data-reporting-request";

vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.mocked(apiFetch).mockReset());

it.each(["/api/data/import", "/api/data/calculate"] as const)("posts the exact payload to %s through the shared fetcher", async path => {
  const body = { dateFrom: "2026-11-01", dateTo: "2026-11-17", importRunId: "run", calculate: false };
  const result = { import: { importRunId: "saved-run" } };
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify(result)));
  expect(await postDataReportingAction(path, body, "en")).toEqual(result);
  expect(apiFetch).toHaveBeenCalledExactlyOnceWith(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
});

it.each([
  { status: 408, locale: "uk" as const }, { status: 504, locale: "uk" as const },
  { status: 408, locale: "en" as const }, { status: 504, locale: "en" as const },
])("preserves timeout guidance for $status in $locale without retrying the operation", async ({ status, locale }) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("", { status }));
  await expect(postDataReportingAction("/api/data/import", {}, locale)).rejects.toThrow(
    locale === "uk" ? `Перевірте стан операції перед повтором (HTTP ${status})` : `Check the operation status before retrying (HTTP ${status})`,
  );
  expect(apiFetch).toHaveBeenCalledOnce();
});

it.each(["uk", "en"] as const)("preserves localized import-in-progress guidance in %s", async locale => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ code: "RAW_IMPORT_IN_PROGRESS" }), { status: 409 }));
  await expect(postDataReportingAction("/api/data/import", {}, locale)).rejects.toThrow(locale === "uk" ? "Імпорт ще виконується" : "Import is running");
});

it("preserves structured server errors", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Invalid report period" } }), { status: 400 }));
  await expect(postDataReportingAction("/api/data/calculate", {}, "en")).rejects.toThrow("Invalid report period");
});
