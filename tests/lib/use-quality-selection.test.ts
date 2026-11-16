import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useQualitySelection } from "@/components/settings/data-quality-card/use-quality-selection";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn() }));
const setSelection = vi.fn(), setQ = vi.fn(), addEventListener = vi.fn(), removeEventListener = vi.fn(), replaceState = vi.fn();
const location = { search: "", href: "" };
function start(search = "committed") {
  vi.mocked(useState).mockReturnValueOnce([{ code: "MISSING_BRAND", page: 2, search }, setSelection]).mockReturnValueOnce(["unsent draft", setQ]);
  const state = useQualitySelection();
  return { state, cleanup: vi.mocked(useEffect).mock.lastCall![0]() };
}
beforeEach(() => {
  vi.clearAllMocks();
  location.search = "?qualityCode=MISSING_COST&qualityPage=3&qualityQ=from-url&tab=health";
  location.href = `https://example.test/en/settings${location.search}#diagnostics`;
  vi.stubGlobal("window", { location, history: { replaceState }, addEventListener, removeEventListener });
});
afterEach(() => vi.unstubAllGlobals());
it("restores selection and search draft from URL and listens for browser navigation", () => {
  const { cleanup } = start();
  expect(setSelection).toHaveBeenCalledWith({ code: "MISSING_COST", page: 3, search: "from-url" });
  expect(setQ).toHaveBeenCalledWith("from-url");
  const read = addEventListener.mock.calls[0][1];
  location.search = "?qualityCode=MISSING_BRAND&qualityPage=2&qualityQ=back";
  read();
  expect(setSelection).toHaveBeenLastCalledWith({ code: "MISSING_BRAND", page: 2, search: "back" });
  expect(setQ).toHaveBeenLastCalledWith("back");
  cleanup?.();
  expect(removeEventListener).toHaveBeenCalledWith("popstate", read);
});
it("pages with committed search rather than a pending draft while retaining other URL context", () => {
  const { state } = start();
  setQ.mockClear();
  state.select("MISSING_BRAND", 4);
  expect(setSelection).toHaveBeenLastCalledWith({ code: "MISSING_BRAND", page: 4, search: "committed" });
  expect(setQ).not.toHaveBeenCalled();
  const url = replaceState.mock.calls[0][2] as URL;
  expect(url.searchParams.get("qualityQ")).toBe("committed");
  expect(url.searchParams.get("qualityPage")).toBe("4");
  expect(url.searchParams.get("tab")).toBe("health");
  expect(url.hash).toBe("#diagnostics");
});
it("submits a new search on page one and removes empty/default query parameters", () => {
  const { state } = start();
  state.select("", 1, "new search");
  let url = replaceState.mock.lastCall![2] as URL;
  expect(url.searchParams.get("qualityQ")).toBe("new search");
  expect(url.searchParams.has("qualityPage")).toBe(false);
  expect(url.searchParams.has("qualityCode")).toBe(false);
  state.select("", 1, "");
  url = replaceState.mock.lastCall![2] as URL;
  expect(url.searchParams.has("qualityQ")).toBe(false);
});
it("uses existing validation for malformed URL values", () => {
  location.search = "?qualityPage=-1&qualityCode=invalid-code&qualityQ=" + "x".repeat(250);
  start();
  expect(setSelection).toHaveBeenCalledWith({ code: "", page: 1, search: "x".repeat(200) });
});
