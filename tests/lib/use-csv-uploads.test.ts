import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCsvUploads } from "@/components/settings/csv-import-card/use-csv-uploads";
import { fetchCsvUploads, type CsvUploadsResponse } from "@/lib/client/csv-import-request";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/lib/client/csv-import-request", () => ({ fetchCsvUploads: vi.fn() }));
const data: CsvUploadsResponse = { source: { sourceId: "csv", timezone: "Europe/Kyiv" }, uploads: [], suppliers: [{ id: "s", name: "Supplier" }] };
const setData = vi.fn(), onLoaded = vi.fn(), onInitialError = vi.fn();
function start(canManage = true, loaded: CsvUploadsResponse | null = null) {
  vi.mocked(useState).mockReturnValue([loaded, setData]);
  vi.mocked(useRef).mockReturnValueOnce({ current: false }).mockReturnValueOnce({ current: null });
  const state = useCsvUploads(canManage, { onLoaded, onInitialError });
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { state, cleanup };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(fetchCsvUploads).mockResolvedValue(data); });
it("loads metadata for managers and returns the current lists", async () => {
  const { state } = start(true, data);
  await vi.waitFor(() => expect(setData).toHaveBeenCalledWith(data));
  expect(onLoaded).toHaveBeenCalledWith(data);
  expect(state).toMatchObject({ source: data.source, uploads: data.uploads, suppliers: data.suppliers });
  expect(vi.mocked(fetchCsvUploads).mock.calls[0][0]).toBeInstanceOf(AbortSignal);
});
it("does not fetch or expose loaded data to non-managers", async () => {
  const { state } = start(false, data);
  await state.reload();
  expect(fetchCsvUploads).not.toHaveBeenCalled();
  expect(state).toMatchObject({ source: null, uploads: [], suppliers: [] });
});
it("keeps only the latest response when reload supersedes an earlier load", async () => {
  let resolve!: (value: CsvUploadsResponse) => void;
  vi.mocked(fetchCsvUploads).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { state } = start();
  const previous = vi.mocked(fetchCsvUploads).mock.calls[0][0]!;
  await state.reload();
  expect(previous.aborted).toBe(true);
  resolve({ ...data, source: { sourceId: "old", timezone: "UTC" } });
  await Promise.resolve();
  expect(setData).toHaveBeenCalledOnce();
  expect(setData).toHaveBeenCalledWith(data);
  expect(onLoaded).toHaveBeenCalledOnce();
});
it("aborts cleanup and suppresses a late response", async () => {
  let resolve!: (value: CsvUploadsResponse) => void;
  vi.mocked(fetchCsvUploads).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { state, cleanup } = start();
  const signal = vi.mocked(fetchCsvUploads).mock.calls[0][0]!;
  cleanup?.();
  expect(signal.aborted).toBe(true);
  resolve(data);
  await Promise.resolve();
  await state.reload();
  expect(setData).not.toHaveBeenCalled();
  expect(onLoaded).not.toHaveBeenCalled();
  expect(onInitialError).not.toHaveBeenCalled();
  expect(fetchCsvUploads).toHaveBeenCalledOnce();
});
it("reports an initial failure but propagates a manual reload failure to its caller", async () => {
  vi.mocked(fetchCsvUploads).mockRejectedValueOnce(new Error("initial"));
  const { state } = start();
  await vi.waitFor(() => expect(onInitialError).toHaveBeenCalledOnce());
  vi.mocked(fetchCsvUploads).mockRejectedValueOnce(new Error("manual"));
  await expect(state.reload()).rejects.toThrow("manual");
  expect(onInitialError).toHaveBeenCalledOnce();
  expect(setData).not.toHaveBeenCalled();
});
it("does not report an aborted load as an error", async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(fetchCsvUploads).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const { cleanup } = start();
  cleanup?.();
  reject(new DOMException("Aborted", "AbortError"));
  await Promise.resolve();
  await Promise.resolve();
  expect(onInitialError).not.toHaveBeenCalled();
});
