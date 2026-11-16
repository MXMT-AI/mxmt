import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useMerchandisingSettings } from "@/components/settings/merchandising-settings-card/use-merchandising-settings";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn(), useCallback: (callback: unknown) => callback }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setData = vi.fn(), setError = vi.fn(), setLoading = vi.fn();
const data = { client: { id: "demo" }, items: [] };
const response = (body: unknown = data, status = 200) => new Response(JSON.stringify(body), { status });
function start(lang: "uk" | "en" = "en") {
  vi.mocked(useState).mockReturnValueOnce([null, setData]).mockReturnValueOnce(["", setError]).mockReturnValueOnce([false, setLoading]);
  const state = useMerchandisingSettings("brand", 2, "A&B", lang);
  return { state, cleanup: vi.mocked(useEffect).mock.lastCall![0]() };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRef).mockReturnValue({ current: 0 });
  vi.mocked(apiFetch).mockImplementation(async () => response());
});
it("loads the selected resource, page and encoded search and can clear stale display data", async () => {
  const { state } = start();
  await vi.waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
  expect(apiFetch).toHaveBeenCalledWith("/api/settings/merchandising?resource=brand&page=2&q=A%26B", { signal: expect.any(AbortSignal), cache: "no-store" });
  expect(setData).toHaveBeenCalledWith(data);
  expect(setError).toHaveBeenCalledWith("");
  state.clear();
  expect(setData).toHaveBeenLastCalledWith(null);
});
it("does not let an older response overwrite a manual refresh", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { state } = start();
  await state.load();
  finish(response({ client: { id: "old" }, items: [] }));
  await vi.waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
  expect(setData).toHaveBeenCalledExactlyOnceWith(data);
});
it("aborts cleanup and ignores a late response", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { cleanup } = start();
  const signal = vi.mocked(apiFetch).mock.calls[0][1]!.signal!;
  cleanup?.();
  expect(signal.aborted).toBe(true);
  finish(response());
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(setData).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledExactlyOnceWith("");
  expect(setLoading).toHaveBeenCalledExactlyOnceWith(true);
});
it.each(["uk", "en"] as const)("localizes initial failures and propagates refresh errors in %s", async lang => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response({}, 503));
  const { state } = start(lang);
  await vi.waitFor(() => expect(setError).toHaveBeenLastCalledWith(lang === "uk"
    ? "Не вдалося завантажити налаштування. Спробуйте ще раз."
    : "Could not load settings. Try again."));
  vi.mocked(apiFetch).mockResolvedValueOnce(response({}));
  await expect(state.load()).rejects.toThrow("SETTINGS_UNAVAILABLE");
  expect(setData).not.toHaveBeenCalled();
});
