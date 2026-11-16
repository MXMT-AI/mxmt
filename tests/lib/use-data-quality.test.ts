import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDataQuality } from "@/components/settings/data-quality-card/use-data-quality";
import { fetchDataQuality } from "@/lib/client/data-quality-request";
import type { Quality } from "@/components/settings/data-quality-card/data-quality-types";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/lib/client/data-quality-request", () => ({ fetchDataQuality: vi.fn() }));
const data: Quality = { rows: [], pagination: { page: 2, pageSize: 25, totalRows: 0 }, summary: [], affectedStock: [], brands: [], aliases: [], components: [], normalizationReplayRequired: 0 };
const setData = vi.fn(), setLoading = vi.fn(), onError = vi.fn();
function start(lang: "uk" | "en" = "en") {
  vi.mocked(useState).mockReturnValueOnce([null, setData]).mockReturnValueOnce([false, setLoading]);
  vi.mocked(useRef).mockReturnValue({ current: 0 });
  const state = useDataQuality({ page: 2, search: "test", code: "MISSING_COST", revision: 3, lang, onError });
  return { state, cleanup: vi.mocked(useEffect).mock.lastCall![0]() };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(fetchDataQuality).mockResolvedValue(data); });
it("loads selected quality diagnostics and clears the previous error", async () => {
  start();
  await vi.waitFor(() => expect(setData).toHaveBeenCalledWith(data));
  expect(fetchDataQuality).toHaveBeenCalledWith({ page: 2, search: "test", code: "MISSING_COST" }, expect.any(AbortSignal));
  expect(onError).toHaveBeenCalledWith("");
  expect(setLoading.mock.calls).toEqual([[true], [false]]);
});
it("ignores an older response and its loading state after a reload", async () => {
  let resolve!: (value: Quality) => void;
  vi.mocked(fetchDataQuality).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { state } = start();
  await state.load();
  resolve({ ...data, normalizationReplayRequired: 99 });
  await Promise.resolve();
  expect(setData).toHaveBeenCalledOnce();
  expect(setData).toHaveBeenCalledWith(data);
  expect(setLoading.mock.calls.filter(call => call[0] === false)).toHaveLength(1);
});
it("aborts cleanup and ignores a late response", async () => {
  let resolve!: (value: Quality) => void;
  vi.mocked(fetchDataQuality).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { cleanup } = start();
  const signal = vi.mocked(fetchDataQuality).mock.calls[0][1]!;
  cleanup?.();
  expect(signal.aborted).toBe(true);
  resolve(data);
  await Promise.resolve();
  expect(setData).not.toHaveBeenCalled();
  expect(setLoading).not.toHaveBeenCalledWith(false);
});
it.each(["uk", "en"] as const)("reports initial failure in %s and propagates manual reload errors", async lang => {
  vi.mocked(fetchDataQuality).mockRejectedValueOnce(new Error("initial"));
  const { state } = start(lang);
  await vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith(lang === "en" ? "Could not load data quality. Try again." : "Не вдалося завантажити якість даних. Спробуйте ще раз."));
  vi.mocked(fetchDataQuality).mockRejectedValueOnce(new Error("manual"));
  await expect(state.load()).rejects.toThrow("manual");
  expect(setLoading).toHaveBeenLastCalledWith(false);
});
