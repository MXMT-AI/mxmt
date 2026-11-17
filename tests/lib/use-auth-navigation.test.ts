import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAuthNavigation } from "@/components/auth/use-auth-navigation/use-auth-navigation";

const mocks = vi.hoisted(() => ({ params: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: mocks.params }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params.mockReturnValue(new URLSearchParams());
  vi.stubGlobal("window", { location: { search: "" } });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps an encoded return path intact when switching between auth forms", () => {
  const destination = "/uk/sales?currency=EUR&brandId=a%26b#sku";
  mocks.params.mockReturnValue(new URLSearchParams({ next: destination }));
  const state = useAuthNavigation("uk");
  expect(new URLSearchParams(state.authQuery).get("next")).toBe(destination);
  expect(mocks.push).not.toHaveBeenCalled();
});

it("does not add a query for a missing return path", () => {
  expect(useAuthNavigation("en").authQuery).toBe("");
});

it.each(["uk", "en"] as const)("uses the latest return path and lets the router apply locale %s", locale => {
  mocks.params.mockReturnValue(new URLSearchParams({ next: "/stock" }));
  const state = useAuthNavigation(locale);
  window.location.search = `?${new URLSearchParams({ next: "/uk/sales?currency=EUR#sku" })}`;
  state.navigateAfterAuth();
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/sales?currency=EUR#sku");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it.each([null, "https://example.test", "//example.test", "/en/login", "/api/data"])("falls back to the dashboard for %s", next => {
  window.location.search = next === null ? "" : `?${new URLSearchParams({ next })}`;
  useAuthNavigation("en").navigateAfterAuth();
  expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
