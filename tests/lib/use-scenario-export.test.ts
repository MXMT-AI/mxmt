import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useScenarioExport } from "@/components/merchandising/use-scenario-export";
import { requestScenarioExport } from "@/lib/client/scenario-export-request";
const history = vi.hoisted(() => ({ history: [], historyError: false, reloadHistory: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/components/merchandising/use-export-history", () => ({ useExportHistory: () => history }));
vi.mock("@/lib/client/scenario-export-request", () => ({ requestScenarioExport: vi.fn() }));
const setReceipt = vi.fn(), setBusy = vi.fn(), setError = vi.fn();
function start() {
  vi.mocked(useState).mockReturnValueOnce([null, setReceipt]).mockReturnValueOnce([false, setBusy]).mockReturnValueOnce(["", setError]);
  vi.mocked(useRef).mockReturnValueOnce({ current: null }).mockReturnValueOnce({ current: false });
  return useScenarioExport("reorder");
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestScenarioExport).mockImplementation(async command => ({ ...command, actionId: "a", actorId: "user", createdAt: "2026-10-26T10:00:00Z", files: [] }));
});
it("reuses an uncertain attempt ID, then creates a new ID after confirmed success", async () => {
  vi.mocked(requestScenarioExport).mockRejectedValueOnce(new Error("EXPORT_FAILED"));
  const state = start();
  await state.prepare("preview", { rows: [] });
  expect(setError).toHaveBeenCalledWith("EXPORT_FAILED");
  expect(history.reloadHistory).not.toHaveBeenCalled();
  await state.prepare("preview", { rows: [] });
  const calls = vi.mocked(requestScenarioExport).mock.calls;
  expect(calls[1][0].exportId).toBe(calls[0][0].exportId);
  expect(history.reloadHistory).toHaveBeenCalledOnce();
  await state.prepare("preview", { rows: [] });
  expect(calls[2][0].exportId).not.toBe(calls[1][0].exportId);
  expect(setReceipt).toHaveBeenCalledTimes(2);
});
it("blocks concurrent requests and refreshes history only after success", async () => {
  let finish!: (value: any) => void;
  vi.mocked(requestScenarioExport).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.prepare("p", {});
  await state.prepare("p", {});
  expect(requestScenarioExport).toHaveBeenCalledTimes(1);
  finish({ exportId: "e", files: [] }); await pending;
  expect(history.reloadHistory).toHaveBeenCalledOnce();
  expect(setBusy.mock.calls).toEqual([[true], [false]]);
});
it("keeps unresolved attempt IDs separate across supplier targets", async () => {
  vi.mocked(requestScenarioExport).mockRejectedValue(new Error("EXPORT_FAILED"));
  const state = start();
  const target = { supplierId: "a", currency: "UAH" };
  await state.prepare("p", {}, target);
  await state.prepare("p", {}, { ...target, supplierId: "b" });
  await state.prepare("p", {}, target);
  const calls = vi.mocked(requestScenarioExport).mock.calls.map(([body]) => body);
  expect(calls[0].target).toEqual(target);
  expect(calls[1].exportId).not.toBe(calls[0].exportId);
  expect(calls[2].exportId).toBe(calls[0].exportId);
});
