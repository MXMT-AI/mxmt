import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useImportProgress } from "@/components/settings/sales-drive-import-card/use-import-progress";
import type { ImportResponse, Progress } from "@/components/settings/sales-drive-import-card/import-types";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setInfo = vi.fn(), setLoaded = vi.fn(), setBusy = vi.fn(), setError = vi.fn(), onCompleted = vi.fn();
const job: Progress = { id: "job", state: "RUNNING", mode: "BACKFILL", stats: {}, issues: [], errorCode: null, availableAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T12:00:00Z" };
const response = (data: unknown = { job: null }, status = 200) => new Response(JSON.stringify(data), { status });
function start(info: ImportResponse = {}, options = {}) {
  vi.mocked(useState).mockReturnValueOnce([info, setInfo]).mockReturnValueOnce([true, setLoaded])
    .mockReturnValueOnce([false, setBusy]).mockReturnValueOnce(["", setError]);
  const state = useImportProgress({ lang: "en", canManage: true, resource: "orders", generic: false, onCompleted, ...options });
  return { state, effects: vi.mocked(useEffect).mock.calls.slice(-3).map(call => call[0]) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRef).mockImplementation(initial => ({ current: initial }));
  vi.mocked(apiFetch).mockImplementation(async () => response());
});
afterEach(() => vi.useRealTimers());
it.each([
  ["orders", false, "/api/connectors/salesdrive/import"],
  ["inventory", false, "/api/connectors/salesdrive/inventory"],
  ["sync", true, "/api/connectors/sync"],
] as const)("loads the correct endpoint for %s with generic=%s", async (resource, generic, endpoint) => {
  const { effects } = start({}, { resource, generic });
  const cleanup = effects[0]();
  await vi.waitFor(() => expect(setInfo).toHaveBeenCalledWith({ job: null }));
  expect(apiFetch).toHaveBeenCalledWith(endpoint, { cache: "no-store", signal: expect.any(AbortSignal) });
  cleanup?.();
  expect(vi.mocked(apiFetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
});
it("derives job and coverage directly from one progress response", () => {
  const coverage = { firstObservedAt: null, observedDays: 0 };
  const info = { job, coverage };
  const { state } = start(info);
  expect(state.job).toBe(job);
  expect(state.coverage).toBe(coverage);
  expect(state.syncInfo).toBe(info);
});
it("ignores an older read after refresh and an aborted response", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { state, effects } = start();
  const cleanup = effects[0]();
  await state.load();
  cleanup?.();
  finish(response({ job }));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setInfo).toHaveBeenCalledExactlyOnceWith({ job: null });
});
it("blocks duplicate mutations and reads during a mutation, then permits retry", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { state } = start();
  const pending = state.act("backfill");
  await state.act("backfill");
  await state.load();
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/salesdrive/import", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "backfill" }),
  });
  finish(response({ code: "IMPORT_BUSY" }, 409));
  await pending;
  expect(setBusy).toHaveBeenLastCalledWith(false);
  expect(setError).toHaveBeenLastCalledWith("Finish or resume the other SalesDrive import before starting this one.");
  await state.act("backfill");
  expect(apiFetch).toHaveBeenCalledTimes(2);
});
it("allows viewers to read progress but not mutate it", async () => {
  const { state } = start({}, { canManage: false });
  await state.act("refresh");
  expect(apiFetch).not.toHaveBeenCalled();
  await state.load();
  expect(apiFetch).toHaveBeenCalledOnce();
});
it("polls every ten seconds without overlapping a slow request and stops on cleanup", async () => {
  vi.useFakeTimers();
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { effects } = start({ job });
  const cleanup = effects[2]();
  await vi.advanceTimersByTimeAsync(9999);
  expect(apiFetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(20001);
  expect(apiFetch).toHaveBeenCalledOnce();
  finish(response());
  await vi.advanceTimersByTimeAsync(0);
  cleanup?.();
  await vi.advanceTimersByTimeAsync(30000);
  expect(apiFetch).toHaveBeenCalledOnce();
});
it("notifies once for a new completion and skips the initial already-completed state", () => {
  const { effects } = start({ job: { ...job, state: "COMPLETE" } });
  effects[1]();
  expect(onCompleted).not.toHaveBeenCalled();
  const previous = vi.mocked(useRef).mock.results[2].value;
  previous.current = "||";
  effects[1]();
  effects[1]();
  expect(onCompleted).toHaveBeenCalledOnce();
});
it("reports initial load failure while enabling progress recovery", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response({}, 503));
  const { effects } = start();
  effects[0]();
  await vi.waitFor(() => expect(setError).toHaveBeenCalledWith("Could not load import progress."));
  expect(setLoaded).toHaveBeenCalledWith(true);
});
