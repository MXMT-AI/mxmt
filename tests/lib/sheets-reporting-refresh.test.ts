import { it, expect, vi } from "vitest";
import { refreshSelectedSheetsReports } from "@/lib/client/sheets-reporting";
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
