import { useEffect, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useExportHistory } from "@/components/merchandising/use-export-history";
import { fetchExportHistory } from "@/lib/client/scenario-export-request";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/lib/client/scenario-export-request", () => ({ fetchExportHistory: vi.fn() }));
const setHistory = vi.fn(), setError = vi.fn(), setReload = vi.fn();
function start() {
  vi.mocked(useState).mockReturnValueOnce([[], setHistory]).mockReturnValueOnce([false, setError]).mockReturnValueOnce([0, setReload]);
  const state = useExportHistory("reprice");
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { state, cleanup };
}
beforeEach(() => vi.clearAllMocks());
it("loads history and exposes a reload action", async () => {
  vi.mocked(fetchExportHistory).mockResolvedValueOnce([]);
  const { state } = start();
  await vi.waitFor(() => expect(setHistory).toHaveBeenCalledWith([]));
  expect(fetchExportHistory).toHaveBeenCalledWith("reprice", expect.any(AbortSignal));
  state.reloadHistory();
  expect(setReload.mock.calls[0][0](1)).toBe(2);
});
it("shows history errors without replacing previously loaded history", async () => {
  vi.mocked(fetchExportHistory).mockRejectedValueOnce(new Error());
  start();
  await vi.waitFor(() => expect(setError).toHaveBeenCalledWith(true));
  expect(setHistory).not.toHaveBeenCalled();
});
it.each([false, true])("cancels and ignores a delayed history result (failure: %s)", async failure => {
  let finish!: () => void;
  vi.mocked(fetchExportHistory).mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { finish = resolve; });
    if (failure) throw new Error();
    return [];
  });
  const { cleanup } = start(); cleanup?.();
  expect(vi.mocked(fetchExportHistory).mock.calls[0][1].aborted).toBe(true);
  setError.mockClear();
  finish(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(setHistory).not.toHaveBeenCalled();
  expect(setError).not.toHaveBeenCalled();
});
