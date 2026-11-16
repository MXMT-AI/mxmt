import { useEffect, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useImportIssues } from "@/components/settings/import-issue-list/use-import-issues";
import { fetchImportIssues, type ImportIssuesResult } from "@/lib/client/import-issues-request";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/client/import-issues-request", () => ({ fetchImportIssues: vi.fn() }));
const setData = vi.fn(), setError = vi.fn(), setLoading = vi.fn(), setRetry = vi.fn();
const data: ImportIssuesResult = { rows: [], pagination: { totalRows: 0, totalPages: 0 } };
function start(open = true) {
  vi.mocked(useState).mockReturnValueOnce([null, setData]).mockReturnValueOnce([false, setError])
    .mockReturnValueOnce([false, setLoading]).mockReturnValueOnce([0, setRetry]);
  const state = useImportIssues({ open, page: 2, code: "SKU_ALIAS_UNRESOLVED", revision: 3 });
  const effect = vi.mocked(useEffect).mock.lastCall!;
  const cleanup = effect[0]();
  return { state, cleanup, dependencies: effect[1] };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(fetchImportIssues).mockResolvedValue(data); });

it("loads only after disclosure opens and tracks all query and refresh dependencies", async () => {
  start(false);
  expect(fetchImportIssues).not.toHaveBeenCalled();
  const { dependencies } = start();
  await vi.waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
  expect(fetchImportIssues).toHaveBeenCalledWith(2, "SKU_ALIAS_UNRESOLVED", expect.any(AbortSignal));
  expect(setData).toHaveBeenCalledWith(data);
  expect(setError).toHaveBeenCalledWith(false);
  expect(dependencies).toEqual([true, 2, "SKU_ALIAS_UNRESOLVED", 3, 0]);
});

it("reports a failure and provides a retry without changing selection", async () => {
  vi.mocked(fetchImportIssues).mockRejectedValueOnce(new Error("offline"));
  const { state } = start();
  await vi.waitFor(() => expect(setError).toHaveBeenLastCalledWith(true));
  expect(setData).not.toHaveBeenCalled();
  state.retry();
  expect(setRetry.mock.lastCall![0](4)).toBe(5);
});

it("aborts superseded loads and ignores their late responses", async () => {
  let finish!: (value: ImportIssuesResult) => void;
  vi.mocked(fetchImportIssues).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const old = start();
  const signal = vi.mocked(fetchImportIssues).mock.calls[0][2];
  old.cleanup?.();
  expect(signal.aborted).toBe(true);
  start();
  await vi.waitFor(() => expect(setData).toHaveBeenCalledWith(data));
  finish({ rows: [], pagination: { totalRows: 99, totalPages: 4 } });
  await Promise.resolve();
  await Promise.resolve();
  expect(setData).toHaveBeenCalledOnce();
});

it("does not report cleanup cancellation or clear loading for a later request", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(fetchImportIssues).mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  const { cleanup } = start();
  cleanup?.();
  fail(new Error("cancelled"));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(setError).toHaveBeenCalledExactlyOnceWith(false);
  expect(setLoading).toHaveBeenCalledExactlyOnceWith(true);
});
