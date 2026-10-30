import { it, expect, vi } from "vitest";
import { selectedSheetsProjectionIntent, refreshSelectedSheetsReports, sheetsRefreshMessage } from "@/lib/client/sheets-reporting";
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
it("keeps catalogue conflicts distinct from temporary server failures", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ code: "SHEETS_CATALOG_IDENTITY_CONFLICT", requestId: "request-123" }, 422));
  await expect(selectedSheetsProjectionIntent(fetcher)).rejects.toMatchObject({ code: "SHEETS_CATALOG_IDENTITY_CONFLICT", requestId: "request-123" });
  expect(sheetsRefreshMessage("SHEETS_CATALOG_IDENTITY_CONFLICT", "uk")).toContain("Перевірте ID товарів і SKU");
  expect(sheetsRefreshMessage("SHEETS_CATALOG_IDENTITY_CONFLICT", "en")).toContain("Review product IDs and SKU mappings");
});
it.each([null, [], "upstream unavailable", 0, false])("handles non-object JSON error bodies (%j) without losing timeout guidance", async body => {
  for (const [status, code] of [[504, "SHEETS_REFRESH_TIMEOUT"], [408, "SHEETS_REFRESH_TIMEOUT"], [503, "SHEETS_REFRESH_FAILED"]] as const) {
    const fetcher = vi.fn().mockResolvedValue(response(body, status));
    await expect(selectedSheetsProjectionIntent(fetcher)).rejects.toMatchObject({ code, requestId: undefined });
  }
});
it("distinguishes a non-JSON gateway timeout and keeps a safe server request ID", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("Gateway timeout", { status: 504 }));
  await expect(selectedSheetsProjectionIntent(fetcher)).rejects.toMatchObject({ code: "SHEETS_REFRESH_TIMEOUT" });
  expect(sheetsRefreshMessage("SHEETS_REFRESH_TIMEOUT", "uk")).toContain("Імпорт збережено");
  const failed = vi.fn().mockResolvedValue(response({ code: "SHEETS_MAPPING_UNAVAILABLE", requestId: "request-123" }, 503));
  await expect(selectedSheetsProjectionIntent(failed)).rejects.toMatchObject({ code: "SHEETS_MAPPING_UNAVAILABLE", requestId: "request-123" });
  const unsafe = vi.fn().mockResolvedValue(response({ requestId: "private/database/password" }, 503));
  await expect(selectedSheetsProjectionIntent(unsafe)).rejects.toMatchObject({ requestId: undefined });
});
it("keeps source selection explicit and does not project when SalesDrive is selected", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      response({
        sourceId: "remote",
        connections: [{ sourceId: "remote", provider: "salesdrive" }],
      }),
    );
  expect(await refreshSelectedSheetsReports(undefined, fetcher)).toEqual({
    state: "NOT_SELECTED",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("captures and submits the exact current intent after raw import without extra provider data", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        sourceId: "sheet",
        connections: [{ sourceId: "sheet", provider: "sheets" }],
      }),
    )
    .mockResolvedValueOnce(
      response({
        sourceId: "sheet",
        importRunId: "run",
        mappingId: "mapping",
        selectionRevision: 3,
      }),
    )
    .mockResolvedValueOnce(response({ outcome: "projected" }));
  expect(await refreshSelectedSheetsReports("run", fetcher)).toEqual({
    state: "READY",
  });
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
    importRunId: "run",
    mappingId: "mapping",
    selectionRevision: 3,
  });
});
it("does not project an unrelated import or bypass a missing mapping", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        sourceId: "sheet",
        connections: [{ sourceId: "sheet", provider: "sheets" }],
      }),
    )
    .mockResolvedValueOnce(response({ importRunId: "other" }));
  await expect(
    refreshSelectedSheetsReports("run", fetcher),
  ).rejects.toMatchObject({ code: "SHEETS_PROJECTION_CHANGED" });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const missing = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        sourceId: "sheet",
        connections: [{ sourceId: "sheet", provider: "sheets" }],
      }),
    )
    .mockResolvedValueOnce(response({ code: "SHEETS_MAPPING_REQUIRED" }, 409));
  await expect(
    refreshSelectedSheetsReports(undefined, missing),
  ).rejects.toMatchObject({ code: "SHEETS_MAPPING_REQUIRED" });
  expect(missing).toHaveBeenCalledTimes(2);
});

it("reads refresh readiness from the selected source even when a different latest Sheets source has no import", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ sourceId: "saved", connections: [
      { sourceId: "latest-empty", provider: "sheets" },
      { sourceId: "saved", provider: "sheets" },
    ] }))
    .mockResolvedValueOnce(response({ importRunId: "saved-run", mappingId: "approved", selectionRevision: 4 }));
  const selected = await selectedSheetsProjectionIntent(fetcher);
  expect(selected?.intent.importRunId).toBe("saved-run");
  expect(fetcher.mock.calls[1][0]).toBe("/api/connectors/sheets/projection/saved");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
