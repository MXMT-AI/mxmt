import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useXlsxExport } from "@/components/ui/use-xlsx-export";
import type { WorkBook } from "xlsx";
const xlsx = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock("xlsx", () => ({ writeFile: xlsx.writeFile }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn() }));
const setExporting = vi.fn(), setError = vi.fn();
const workbook: WorkBook = { SheetNames: ["Order"], Sheets: { Order: {} } };
function start(overrides: Partial<Parameters<typeof useXlsxExport>[0]> = {}) {
  vi.mocked(useState).mockReturnValueOnce([false, setExporting]).mockReturnValueOnce([false, setError]);
  vi.mocked(useRef).mockReturnValueOnce({ current: false });
  return useXlsxExport({ title: "Report", buildWorkbook: () => workbook, ...overrides });
}
beforeEach(() => { vi.clearAllMocks(); xlsx.writeFile.mockReset(); });
it("builds the file on demand, sanitizes its name and blocks duplicate clicks", async () => {
  const buildWorkbook = vi.fn().mockReturnValue(workbook);
  const state = start({ title: "Report/A:B?", buildWorkbook });
  expect(buildWorkbook).not.toHaveBeenCalled();
  expect(xlsx.writeFile).not.toHaveBeenCalled();
  const first = state.exportExcel();
  await state.exportExcel();
  await first;
  expect(buildWorkbook).toHaveBeenCalledOnce();
  expect(xlsx.writeFile).toHaveBeenCalledExactlyOnceWith(workbook, "Report-A-B-.xlsx");
  expect(setExporting.mock.calls).toEqual([[true], [false]]);
});
it("does nothing for a disabled export such as an empty cart", async () => {
  const buildWorkbook = vi.fn();
  await start({ disabled: true, buildWorkbook }).exportExcel();
  expect(buildWorkbook).not.toHaveBeenCalled();
  expect(setExporting).not.toHaveBeenCalled();
  expect(xlsx.writeFile).not.toHaveBeenCalled();
});
it("evaluates dynamic filenames when exporting", async () => {
  const title = vi.fn(() => "PO-2026-11-15");
  const state = start({ title });
  expect(title).not.toHaveBeenCalled();
  await state.exportExcel();
  expect(xlsx.writeFile).toHaveBeenCalledWith(workbook, "PO-2026-11-15.xlsx");
});
it.each(["build", "write"])("reports a %s failure, unlocks and permits retry", async failure => {
  const buildWorkbook = vi.fn().mockReturnValue(workbook);
  if (failure === "build") buildWorkbook.mockImplementationOnce(() => { throw new Error(); });
  else xlsx.writeFile.mockImplementationOnce(() => { throw new Error(); });
  const state = start({ buildWorkbook });
  await state.exportExcel();
  expect(setError).toHaveBeenLastCalledWith(true);
  expect(setExporting).toHaveBeenLastCalledWith(false);
  await state.exportExcel();
  expect(setError).toHaveBeenLastCalledWith(false);
  expect(xlsx.writeFile).toHaveBeenLastCalledWith(workbook, "Report.xlsx");
});
