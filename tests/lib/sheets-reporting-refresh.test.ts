import { it, expect, vi } from "vitest";
import { selectedSheetsProjectionIntent, refreshSelectedSheetsReports } from "@/lib/client/sheets-reporting";
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
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
