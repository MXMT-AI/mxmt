import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { refreshAccessToken } from "@/lib/client/refresh-access-token";

afterEach(() => vi.unstubAllGlobals());
it("keeps locale, filters and hash when the API session cannot be refreshed", async () => {
  const location = { pathname: "/en/stock", search: "?currency=EUR", hash: "#row", href: "" };
  vi.stubGlobal("window", { location });
  const unauthorized = new Response(null, { status: 401 });
  const fetch = vi.fn().mockResolvedValue(unauthorized);
  vi.stubGlobal("fetch", fetch);
  expect(await apiFetch("/api/merchandising/stock")).toBe(unauthorized);
  const url = new URL(location.href, "https://mxmt.example");
  expect(url.pathname).toBe("/en/login");
  expect(url.searchParams.get("next")).toBe("/en/stock?currency=EUR#row");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("retries the original API call after a successful refresh", async () => {
  const response = new Response("ok");
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, {status:401})).mockResolvedValueOnce(response).mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetch);
  expect(await apiFetch("/api/data/sales")).toBe(response);
  expect(fetch).toHaveBeenNthCalledWith(3, "/api/data/sales", undefined);
});
it("keeps the current page on a temporary refresh failure", async () => {
  const location = { pathname: "/uk/overview", search: "", hash: "", href: "" };
  vi.stubGlobal("window", { location });
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 })));
  await expect(apiFetch("/api/merchandising/overview")).rejects.toThrow("503");
  expect(location.href).toBe("");
});
it("shares one refresh across concurrent API failures and the proactive refresh caller", async () => {
  let finish!: (response: Response) => void;
  let authorized = false;
  const pending = new Promise<Response>(resolve => { finish = resolve; });
  const fetch = vi.fn().mockImplementation(async input => input === "/api/auth/refresh"
    ? pending : new Response(null, { status: authorized ? 200 : 401 }));
  vi.stubGlobal("fetch", fetch);
  const first = apiFetch("/api/data/sales"), second = apiFetch("/api/data/stock");
  const proactive = refreshAccessToken();
  await Promise.resolve();
  expect(fetch.mock.calls.filter(call => call[0] === "/api/auth/refresh")).toHaveLength(1);
  authorized = true;
  finish(new Response("{}"));
  const [sales, stock, refreshed] = await Promise.all([first, second, proactive]);
  expect(sales.ok && stock.ok && refreshed).toBe(true);
  expect(fetch.mock.calls.filter(call => call[0] === "/api/auth/refresh")).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(5);
});
