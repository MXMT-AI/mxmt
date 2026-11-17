import { useEffect, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { scheduleRawImportStatusCheck } from "@/lib/client/raw-import-status";
import { useReportStatus, type DataStatus } from "@/components/data-reporting/use-report-status/use-report-status";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/client/raw-import-status", () => ({ scheduleRawImportStatusCheck: vi.fn() }));
const setStatus = vi.fn(), setLoading = vi.fn(), onError = vi.fn(), cancel = vi.fn();
const status: DataStatus = { connection: null, configured: false, source: null, activeImport: null, latestImport: { status: "RUNNING", createdAt: "2026-11-17T00:00:00Z" }, calculation: null, issueCounts: {} };

function start(actionPending = false) {
  vi.mocked(useState).mockReturnValueOnce([status, setStatus]).mockReturnValueOnce([true, setLoading]);
  useReportStatus({ reloadVersion: 0, actionPending, onError });
  return vi.mocked(useEffect).mock.calls.map(call => call[0]);
}
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(apiFetch).mockReset();
  vi.mocked(scheduleRawImportStatusCheck).mockReturnValue(cancel);
});

it("loads the latest status through the shared fetcher", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify(status)));
  start()[0]();
  await vi.waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
  expect(apiFetch).toHaveBeenCalledWith("/api/data/status", { cache: "no-store", signal: expect.any(AbortSignal) });
  expect(setStatus).toHaveBeenCalledWith(status);
  expect(onError).not.toHaveBeenCalled();
});

it("reports a request failure without replacing previous status", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));
  start()[0]();
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("Offline"));
  expect(setStatus).not.toHaveBeenCalled();
  expect(setLoading).toHaveBeenLastCalledWith(false);
});

it("aborts and ignores a late result after cleanup", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = start()[0](); cleanup?.();
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  setLoading.mockClear();
  finish(new Response(JSON.stringify(status)));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setStatus).not.toHaveBeenCalled();
  expect(setLoading).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

it("does not schedule polling while a manual action is pending", () => {
  expect(start(true)[1]()).toBeUndefined();
  expect(scheduleRawImportStatusCheck).not.toHaveBeenCalled();
});

it("polls quietly and schedules another status check after a transient failure", async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Offline"));
  const cleanup = start()[1]();
  const [run, poll, expired] = vi.mocked(scheduleRawImportStatusCheck).mock.calls[0];
  expect(run).toBe(status.latestImport);
  poll();
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("Offline"));
  expect(setLoading).not.toHaveBeenCalled();
  const update = setStatus.mock.calls[0][0];
  expect(update(status)).toEqual(status);
  expect(update(status)).not.toBe(status);
  expect(update(null)).toBeNull();
  expired();
  expect(setStatus).toHaveBeenCalledTimes(2);
  cleanup?.();
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
});
