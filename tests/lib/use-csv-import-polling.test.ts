import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCsvImportPolling } from "@/components/settings/csv-import-card/use-csv-import-polling";
import { fetchCsvUpload } from "@/lib/client/csv-import-request";
import type { CsvPreview } from "@/components/settings/csv-import-card/csv-import-types";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useEffectEvent: (callback: unknown) => callback }));
vi.mock("@/lib/client/csv-import-request", () => ({ fetchCsvUpload: vi.fn() }));
const packet: CsvPreview = { id: "packet", sourceId: "csv", contentHash: "hash", state: "QUEUED", expiresAt: "2026-11-20", preview: { counts: {}, errors: [], warnings: [] } };
const onUpdate = vi.fn(), onActive = vi.fn(), onError = vi.fn();
function start(preview: CsvPreview | null = packet) {
  useCsvImportPolling({ preview, onUpdate, onActive, onError });
  return vi.mocked(useEffect).mock.lastCall![0]();
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); onActive.mockResolvedValue(undefined); vi.mocked(fetchCsvUpload).mockResolvedValue(packet); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it.each([null, { ...packet, state: "READY" }, { ...packet, state: "ACTIVE" }, { ...packet, job: { state: "FAILED", errorCode: "ERR" } }, { ...packet, job: { state: "PAUSED", errorCode: null } }])("does not poll ineligible packet %j", preview => {
  start(preview);
  expect(vi.getTimerCount()).toBe(0);
  expect(fetchCsvUpload).not.toHaveBeenCalled();
});
it("waits three seconds and prevents overlapping requests", async () => {
  let resolve!: (value: CsvPreview) => void;
  vi.mocked(fetchCsvUpload).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const cleanup = start();
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetchCsvUpload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3001);
  expect(fetchCsvUpload).toHaveBeenCalledOnce();
  resolve(packet);
  await vi.advanceTimersByTimeAsync(0);
  expect(onUpdate).toHaveBeenCalledWith(packet);
  cleanup?.();
  expect(vi.getTimerCount()).toBe(0);
});
it("notifies activation once and stops immediately before a rerender", async () => {
  const active = { ...packet, state: "ACTIVE" };
  vi.mocked(fetchCsvUpload).mockResolvedValueOnce(active);
  start();
  await vi.advanceTimersByTimeAsync(12000);
  expect(fetchCsvUpload).toHaveBeenCalledOnce();
  expect(onUpdate).toHaveBeenCalledWith(active);
  expect(onActive).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("aborts and ignores a late response after cleanup", async () => {
  let resolve!: (value: CsvPreview) => void;
  vi.mocked(fetchCsvUpload).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const cleanup = start();
  await vi.advanceTimersByTimeAsync(3000);
  const signal = vi.mocked(fetchCsvUpload).mock.calls[0][1]!;
  cleanup?.();
  expect(signal.aborted).toBe(true);
  resolve({ ...packet, state: "ACTIVE" });
  await vi.advanceTimersByTimeAsync(0);
  expect(onUpdate).not.toHaveBeenCalled();
  expect(onActive).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
it("reports transient failure and allows the next scheduled retry", async () => {
  vi.mocked(fetchCsvUpload).mockRejectedValueOnce(new Error("offline"));
  start();
  await vi.advanceTimersByTimeAsync(6000);
  expect(onError).toHaveBeenCalledOnce();
  expect(fetchCsvUpload).toHaveBeenCalledTimes(2);
  expect(onUpdate).toHaveBeenCalledWith(packet);
});
it.each(["PAUSED", "FAILED"])("stops when the next job state is %s", async state => {
  vi.mocked(fetchCsvUpload).mockResolvedValueOnce({ ...packet, job: { state, errorCode: null } });
  start();
  await vi.advanceTimersByTimeAsync(9000);
  expect(fetchCsvUpload).toHaveBeenCalledOnce();
  expect(onActive).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
