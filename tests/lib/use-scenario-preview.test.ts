import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useScenarioPreview } from "@/components/merchandising/use-scenario-preview";
import { postScenario } from "@/lib/client/scenario-preview-request";
const latest = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), cleanup: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn(), useRef: vi.fn() }));
vi.mock("@/lib/scenario-preview", () => ({ LatestScenarioRequest: class { schedule = latest.schedule; cancel = latest.cancel; } }));
vi.mock("@/lib/client/scenario-preview-request", async load => ({ ...await load<typeof import("@/lib/client/scenario-preview-request")>(), postScenario: vi.fn() }));
const setResult = vi.fn(), setError = vi.fn(), setRetry = vi.fn();
function start(request: object | null, identity: "snapshotId" | "inputSetId" = "snapshotId") {
  vi.mocked(useState).mockReturnValueOnce([null, setResult]).mockReturnValueOnce([null, setError]).mockReturnValueOnce([0, setRetry]);
  vi.mocked(useRef).mockReturnValueOnce({ current: null });
  const state = useScenarioPreview("/preview", request, "controls", identity);
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { state, cleanup };
}
beforeEach(() => {
  vi.clearAllMocks();
  latest.schedule.mockReturnValue(latest.cleanup);
});
it.each(["snapshotId", "inputSetId"] as const)("validates %s and passes the cancellation signal", async identity => {
  const request = { [identity]: "expected" };
  const data = { previewId: "p", [identity]: "expected" };
  vi.mocked(postScenario).mockResolvedValueOnce(data);
  const { cleanup } = start(request, identity);
  const [load, commit] = latest.schedule.mock.calls[0];
  const signal = new AbortController().signal;
  expect(await load(signal)).toEqual(data);
  expect(postScenario).toHaveBeenCalledWith("/preview", request, signal);
  commit(data);
  expect(setResult).toHaveBeenCalledWith({ key: JSON.stringify(request), controls: "controls", data });
  expect(cleanup).toBe(latest.cleanup);
});
it.each(["snapshotId", "inputSetId"] as const)("rejects a preview for another %s", async identity => {
  vi.mocked(postScenario).mockResolvedValueOnce({ previewId: "p", [identity]: "other" });
  start({ [identity]: "expected" }, identity);
  const [load] = latest.schedule.mock.calls[0];
  await expect(load(new AbortController().signal)).rejects.toThrow("Invalid scenario response");
  expect(setResult).not.toHaveBeenCalled();
});
it("cancels without scheduling a request when no scenario is available", () => {
  start(null);
  expect(latest.cancel).toHaveBeenCalledOnce();
  expect(latest.schedule).not.toHaveBeenCalled();
});
it("normalizes failures and clears them for retry", () => {
  const { state } = start({ snapshotId: "expected" });
  const fail = latest.schedule.mock.calls[0][2];
  fail({ code: "INVALID_REQUEST", details: ["field", null] });
  expect(setError).toHaveBeenCalledWith({ key: '{"snapshotId":"expected"}', error: { code: "INVALID_REQUEST", details: ["field"] } });
  state.retry();
  expect(setError).toHaveBeenLastCalledWith(null);
  expect(setRetry.mock.calls[0][0](1)).toBe(2);
});
