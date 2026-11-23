import { useEffect } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TokenRefreshProvider from "@/components/token-refresh-provider/token-refresh-provider";
import { refreshAccessToken } from "@/lib/client/refresh-access-token";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn() }));
vi.mock("@/lib/client/refresh-access-token", () => ({ refreshAccessToken: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => router }));
const router = { push: vi.fn(), refresh: vi.fn() };
const doc = { cookie: "", visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() };
function expires(seconds: number) { doc.cookie = `access_token_exp=${Math.floor(Date.now() / 1000) + seconds}`; }
function start() { TokenRefreshProvider(); return vi.mocked(useEffect).mock.lastCall![0](); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { location: { pathname: "/en/stock", search: "?currency=UAH", hash: "#sku" } });
  doc.visibilityState = "visible";
  expires(300);
  vi.mocked(refreshAccessToken).mockImplementation(async () => { expires(900); return true; });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("refreshes two minutes before expiry and schedules the updated cookie", async () => {
  const cleanup = start();
  await vi.advanceTimersByTimeAsync(179999);
  expect(refreshAccessToken).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(refreshAccessToken).toHaveBeenCalledOnce();
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(1);
  cleanup?.();
  expect(vi.getTimerCount()).toBe(0);
  expect(doc.removeEventListener).toHaveBeenCalledWith("visibilitychange", doc.addEventListener.mock.calls[0][1]);
});
it("waits for the tab to become visible, then renews even without an expiry cookie", async () => {
  doc.cookie = "";
  doc.visibilityState = "hidden";
  const cleanup = start();
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(refreshAccessToken).not.toHaveBeenCalled();
  doc.visibilityState = "visible";
  doc.addEventListener.mock.calls[0][1]();
  await vi.advanceTimersByTimeAsync(0);
  expect(refreshAccessToken).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(1);
  cleanup?.();
});
it.each([true, false])("ignores repeated visibility events and late success=%s after cleanup", async result => {
  let finish!: (value: boolean) => void;
  vi.mocked(refreshAccessToken).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const cleanup = start();
  expires(-1);
  const visible = doc.addEventListener.mock.calls[0][1];
  visible(); visible(); visible();
  expect(refreshAccessToken).toHaveBeenCalledOnce();
  cleanup?.();
  finish(result);
  await vi.advanceTimersByTimeAsync(0);
  expect(router.refresh).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("retries a network failure after thirty seconds", async () => {
  expires(-1);
  vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error("offline"));
  const cleanup = start();
  await vi.advanceTimersByTimeAsync(29999);
  expect(refreshAccessToken).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(refreshAccessToken).toHaveBeenCalledTimes(2);
  expect(router.refresh).toHaveBeenCalledOnce();
  cleanup?.();
});
it("preserves the current page, query and hash when the session is rejected", async () => {
  expires(-1);
  vi.mocked(refreshAccessToken).mockResolvedValueOnce(false);
  start();
  await vi.advanceTimersByTimeAsync(0);
  const destination = new URL(router.push.mock.lastCall![0], "https://mxmt.test");
  expect(destination.pathname).toBe("/login");
  expect(destination.searchParams.get("next")).toBe("/en/stock?currency=UAH#sku");
  expect(router.refresh).not.toHaveBeenCalled();
});
