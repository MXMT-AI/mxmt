import { useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { postDataReportingAction } from "@/lib/client/data-reporting-request";
import { refreshSelectedSheetsReports } from "@/lib/client/sheets-reporting";
import { useReportActions } from "@/components/data-reporting/use-report-actions/use-report-actions";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn() }));
vi.mock("@/lib/client/data-reporting-request", () => ({ postDataReportingAction: vi.fn() }));
vi.mock("@/lib/client/sheets-reporting", async load => ({ ...await load<typeof import("@/lib/client/sheets-reporting")>(), refreshSelectedSheetsReports: vi.fn() }));
const setAction = vi.fn(), setError = vi.fn(), setReady = vi.fn(), setPeriodError = vi.fn();
const onComplete = vi.fn(), onReload = vi.fn(), dispatchEvent = vi.fn();

function start(overrides: Partial<Parameters<typeof useReportActions>[0]> = {}) {
  vi.mocked(useState).mockReturnValueOnce([null, setAction]).mockReturnValueOnce([null, setError])
    .mockReturnValueOnce([false, setReady]).mockReturnValueOnce([null, setPeriodError]);
  vi.mocked(useRef).mockReturnValueOnce({ current: false });
  return useReportActions({ dateFrom: "2026-11-01", dateTo: "2026-11-17", canImport: true, lang: "en", periodCopy: { periodRequired: "Required", periodReversed: "Reversed" }, onComplete, onReload, ...overrides });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(postDataReportingAction).mockReset().mockResolvedValue({});
  vi.mocked(refreshSelectedSheetsReports).mockReset().mockResolvedValue({ state: "READY" });
  vi.stubGlobal("window", { dispatchEvent });
});
afterEach(() => vi.unstubAllGlobals());

it("imports, projects the exact saved run, then calculates in order", async () => {
  const order: string[] = [];
  vi.mocked(postDataReportingAction).mockImplementation(async path => { order.push(path); return { import: { importRunId: "run" } }; });
  vi.mocked(refreshSelectedSheetsReports).mockImplementation(async id => { order.push(`projection:${id}`); return { state: "READY" }; });
  await start().runAction("import");
  expect(order).toEqual(["/api/data/import", "projection:run", "/api/data/calculate"]);
  expect(postDataReportingAction).toHaveBeenLastCalledWith("/api/data/calculate", { dateFrom: "2026-11-01", dateTo: "2026-11-17", importRunId: "run" }, "en");
  expect(setReady).toHaveBeenLastCalledWith(true);
  expect(dispatchEvent.mock.calls[0][0].type).toBe("connector-connection-changed");
  expect(onComplete).toHaveBeenCalledOnce(); expect(onReload).toHaveBeenCalledOnce();
  expect(setAction).toHaveBeenLastCalledWith(null);
});

it("runs projection without a period and without triggering raw import or calculation", async () => {
  await start({ dateFrom: "", dateTo: "" }).runAction("projection");
  expect(refreshSelectedSheetsReports).toHaveBeenCalledOnce();
  expect(postDataReportingAction).not.toHaveBeenCalled();
  expect(setPeriodError).toHaveBeenLastCalledWith(null);
});

it("calculates for an analyst without initiating a projection", async () => {
  await start({ canImport: false }).runAction("calculate");
  expect(refreshSelectedSheetsReports).not.toHaveBeenCalled();
  expect(postDataReportingAction).toHaveBeenCalledOnce();
  expect(postDataReportingAction).toHaveBeenCalledWith("/api/data/calculate", expect.any(Object), "en");
});

it.each([
  { dateFrom: "", dateTo: "", expected: "Required" },
  { dateFrom: "2026-11-17", dateTo: "2026-11-01", expected: "Reversed" },
])("rejects invalid periods before side effects: $expected", async ({ expected, ...period }) => {
  await start(period).runAction("import");
  expect(setPeriodError).toHaveBeenCalledWith(expected);
  expect(postDataReportingAction).not.toHaveBeenCalled();
  expect(refreshSelectedSheetsReports).not.toHaveBeenCalled();
  expect(onReload).not.toHaveBeenCalled();
});

it("continues calculation after a projection failure and reports the partial failure", async () => {
  vi.mocked(refreshSelectedSheetsReports).mockRejectedValueOnce(new Error("Projection unavailable"));
  await start().runAction("calculate");
  expect(postDataReportingAction).toHaveBeenCalledWith("/api/data/calculate", expect.any(Object), "en");
  expect(setError.mock.lastCall![0]).toContain("The server could not finish MVP projection");
  expect(onComplete).toHaveBeenCalledOnce();
});

it("stops after a failed import, refreshes status and permits retry", async () => {
  vi.mocked(postDataReportingAction).mockRejectedValueOnce(new Error("Import failed"));
  const state = start();
  await state.runAction("import");
  expect(setError).toHaveBeenLastCalledWith("Import failed");
  expect(refreshSelectedSheetsReports).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled(); expect(onReload).toHaveBeenCalledOnce();
  await state.runAction("import");
  expect(onComplete).toHaveBeenCalledOnce();
});

it("blocks overlapping actions before React rerenders", async () => {
  let finish!: (result: unknown) => void;
  vi.mocked(postDataReportingAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.runAction("import");
  await state.runAction("calculate");
  expect(postDataReportingAction).toHaveBeenCalledOnce();
  finish({ import: { importRunId: "run" } }); await pending;
  expect(onReload).toHaveBeenCalledOnce();
});
