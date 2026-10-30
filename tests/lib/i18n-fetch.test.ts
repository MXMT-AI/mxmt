import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";

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
