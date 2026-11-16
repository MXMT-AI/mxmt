import { useEffect, useRef, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useConnectorSource } from "@/components/settings/connector-source-card/use-connector-source";
import { apiFetch } from "@/lib/fetch";
import type { ReportingSources } from "@/lib/reporting-source-contract";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const data: ReportingSources = { sourceId: "old", revision: 4, connections: [] };
const setData = vi.fn(), setSource = vi.fn(), setBusy = vi.fn(), setError = vi.fn(), setMessage = vi.fn(), addEventListener = vi.fn(), removeEventListener = vi.fn();
function start(canManage = true, source = "new") {
  vi.mocked(useRef).mockReturnValue({ current: false });
  vi.mocked(useState).mockReturnValueOnce([data, setData]).mockReturnValueOnce([source, setSource]).mockReturnValueOnce([false, setBusy]).mockReturnValueOnce(["", setError]).mockReturnValueOnce(["", setMessage]);
  return useConnectorSource("en", canManage);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { addEventListener, removeEventListener });
  vi.mocked(apiFetch).mockResolvedValue(Response.json(data));
});
afterEach(() => vi.unstubAllGlobals());
it("loads and refreshes connections from events, ignoring results after cleanup", async () => {
  start();
  const cleanup = vi.mocked(useEffect).mock.calls[0][0]();
  await vi.waitFor(() => expect(setData).toHaveBeenCalledWith(data));
  expect(setSource).toHaveBeenCalledWith("old");
  expect(addEventListener).toHaveBeenCalledWith("connector-connection-changed", expect.any(Function));
  const load = addEventListener.mock.calls[0][1];
  cleanup?.();
  setData.mockClear();
  await load();
  expect(setData).not.toHaveBeenCalled();
  expect(removeEventListener).toHaveBeenCalledWith("connector-connection-changed", load);
});
it("warns before leaving only when the selection is dirty", () => {
  start();
  const cleanup = vi.mocked(useEffect).mock.calls[1][0]();
  const [event, warn] = addEventListener.mock.calls[0];
  expect(event).toBe("beforeunload");
  const preventDefault = vi.fn();
  const value = { preventDefault, returnValue: undefined };
  warn(value);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(value.returnValue).toBe("");
  cleanup?.();
  expect(removeEventListener).toHaveBeenCalledWith(event, warn);
});
it.each([[false, "new"], [true, ""], [true, "old"]])("does not activate with canManage=%s source=%s", async (canManage, source) => {
  await start(canManage as boolean, source as string).activate();
  expect(apiFetch).not.toHaveBeenCalled();
});
it("sends the revision, prevents duplicate submissions and refreshes on success", async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const state = start();
  const pending = state.activate();
  await state.activate();
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/source", expect.objectContaining({ method: "POST", body: JSON.stringify({ sourceId: "new", revision: 4 }) }));
  resolve(Response.json({ ...data, sourceId: "new", revision: 5 }));
  await pending;
  expect(setData).toHaveBeenLastCalledWith({ ...data, sourceId: "new", revision: 5 });
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
it.each(["http", "network"])("allows retry after %s failure without refreshing", async failure => {
  if (failure === "http") vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ error: "CONFLICT" }, { status: 409 }));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error("offline"));
  const state = start();
  await state.activate();
  expect(setError).toHaveBeenLastCalledWith(failure === "http" ? "Source could not be changed. Check the connection and refresh the page." : "Network error. Try again.");
  expect(mocks.refresh).not.toHaveBeenCalled();
  await state.activate();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
