import { useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReportPeriod } from "@/components/data-reporting/use-report-period/use-report-period";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn(), useCallback: (callback: unknown) => callback }));
const setFrom = vi.fn(), setTo = vi.fn();
const calculation = { dateFrom: "2026-10-01T00:00:00Z", dateTo: "2026-10-31T00:00:00Z" };

function start() {
  vi.mocked(useState).mockReturnValueOnce(["", setFrom]).mockReturnValueOnce(["", setTo]);
  vi.mocked(useRef).mockReturnValueOnce({ current: false }).mockReturnValueOnce({ current: { dateFrom: false, dateTo: false } });
  return useReportPeriod();
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

it("initializes from the saved calculation only once", () => {
  const state = start();
  state.initializePeriod(calculation);
  expect(setFrom).toHaveBeenCalledExactlyOnceWith("2026-10-01");
  expect(setTo).toHaveBeenCalledExactlyOnceWith("2026-10-31");
  state.initializePeriod({ dateFrom: "2026-11-01", dateTo: "2026-11-17" });
  expect(setFrom).toHaveBeenCalledOnce(); expect(setTo).toHaveBeenCalledOnce();
});

it("uses the Kyiv month when no saved calculation exists", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-31T22:30:00Z"));
  start().initializePeriod(null);
  expect(setFrom).toHaveBeenCalledWith("2026-02-01");
  expect(setTo).toHaveBeenCalledWith("2026-02-28");
});

it("preserves an edited start date while initializing the untouched end date", () => {
  const state = start();
  state.setDateFrom("2026-09-15");
  state.initializePeriod(calculation);
  expect(setFrom).toHaveBeenCalledExactlyOnceWith("2026-09-15");
  expect(setTo).toHaveBeenCalledWith("2026-10-31");
});

it("preserves an intentionally cleared end date before status arrives", () => {
  const state = start();
  state.setDateTo("");
  state.initializePeriod(calculation);
  expect(setTo).toHaveBeenCalledExactlyOnceWith("");
  expect(setFrom).toHaveBeenCalledWith("2026-10-01");
});

it("does not overwrite manual edits during later status refreshes", () => {
  const state = start();
  state.initializePeriod(calculation);
  state.setDateFrom("2026-09-01"); state.setDateTo("2026-09-30");
  setFrom.mockClear(); setTo.mockClear();
  state.initializePeriod(null);
  expect(setFrom).not.toHaveBeenCalled(); expect(setTo).not.toHaveBeenCalled();
});
