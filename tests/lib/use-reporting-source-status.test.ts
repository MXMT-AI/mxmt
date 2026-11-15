import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReportingSourceStatus } from "@/components/merchandising/use-reporting-source-status";
import { apiFetch } from "@/lib/fetch";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setData = vi.fn(), setError = vi.fn(), setReload = vi.fn();
let events: EventTarget;
function start() {
  vi.mocked(useState).mockReturnValueOnce([null, setData]).mockReturnValueOnce([false, setError]).mockReturnValueOnce([0, setReload]);
  const state = useReportingSourceStatus();
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { state, cleanup };
}
beforeEach(() => {
  vi.clearAllMocks();
  events = new EventTarget();
  vi.stubGlobal("window", events);
});
afterEach(() => vi.unstubAllGlobals());

it("loads current sources and refreshes on retry or a connection change", async () => {
  const sources = { sourceId: "csv", revision: 1, connections: [] };
  vi.mocked(apiFetch).mockResolvedValue(Response.json(sources));
  const { state, cleanup } = start();
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/source", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  await vi.waitFor(() => expect(setData).toHaveBeenCalledWith(sources));
  state.retry();
  events.dispatchEvent(new Event("connector-connection-changed"));
  expect(setReload).toHaveBeenCalledTimes(2);
  for (const [update] of setReload.mock.calls) expect(update(3)).toBe(4);
  cleanup?.();
  events.dispatchEvent(new Event("connector-connection-changed"));
  expect(setReload).toHaveBeenCalledTimes(2);
});

it("reports a failed check and clears the error when retrying", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  const first = start();
  await vi.waitFor(() => expect(setError).toHaveBeenCalledWith(true));
  expect(setData).not.toHaveBeenCalled();
  first.cleanup?.();
  setError.mockClear();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ sourceId: null, revision: 2, connections: [] }));
  const next = start();
  expect(setError).toHaveBeenCalledWith(false);
  await vi.waitFor(() => expect(setData).toHaveBeenCalledOnce());
  next.cleanup?.();
});

it.each([false, true])("ignores a cancelled request's delayed response (failure: %s)", async fail => {
  let finish!: () => void;
  vi.mocked(apiFetch).mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { finish = resolve; });
    if (fail) throw new Error("Network failure");
    return Response.json({ sourceId: "old", revision: 1, connections: [] });
  });
  const first = start();
  const signal = vi.mocked(apiFetch).mock.calls[0][1]!.signal!;
  first.cleanup?.();
  expect(signal.aborted).toBe(true);
  setError.mockClear();
  finish();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setData).not.toHaveBeenCalled();
  expect(setError).not.toHaveBeenCalled();
});
