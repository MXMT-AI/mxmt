import { useEffect, useReducer, useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReorderingEditor } from "@/components/reordering/use-reordering-editor";
import { initialReorderingState, reorderingReducer } from "@/lib/reordering-workspace";

const navigation = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.query) }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useReducer: vi.fn(), useRef: vi.fn() }));
let state: ReturnType<typeof initialReorderingState>;
let lastUrl: { current: string };
let location: { pathname: string; search: string };
const replaceState = vi.fn();
function render(monobrand = false) {
  vi.mocked(useReducer).mockReturnValue([state, (action: Parameters<typeof reorderingReducer>[1]) => { state = reorderingReducer(state, action); }] as never);
  vi.mocked(useRef).mockReturnValue(lastUrl);
  const result = useReorderingEditor(monobrand);
  vi.mocked(useEffect).mock.lastCall![0]();
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  navigation.query = "supplierId=s&leadDays=0&page=3&tab=demo";
  lastUrl = { current: navigation.query };
  state = initialReorderingState(new URLSearchParams(navigation.query));
  location = { pathname: "/en/reordering", search: `?${navigation.query}` };
  replaceState.mockImplementation((_state, _title, url: string) => { location.search = url.slice(url.indexOf("?")); });
  vi.stubGlobal("window", { location, history: { replaceState } });
});
afterEach(() => vi.unstubAllGlobals());
it("initializes from the URL and restores external navigation with cleared overrides", () => {
  expect(render().state.page).toBe(3);
  render().changeTransit("sku", "4");
  navigation.query = "mode=brand&brandId=b&page=2";
  render();
  expect(render().state).toMatchObject({ page: 2, transit: {}, draft: { mode: "brand", filters: { brandId: "b" } } });
  expect(replaceState).not.toHaveBeenCalled();
});
it("updates draft and pagination without restoring away transit edits for its own URL", () => {
  const editor = render();
  editor.changeTransit("sku", "4");
  editor.change({ ...editor.draft, coverDays: "60" });
  expect(state.page).toBe(1);
  expect(state.transit).toEqual({ sku: "4" });
  expect(new URLSearchParams(location.search).get("tab")).toBe("demo");
  expect(new URLSearchParams(location.search).has("page")).toBe(false);
  navigation.query = location.search.slice(1);
  render();
  expect(state.transit).toEqual({ sku: "4" });
  render().changePage(2);
  expect(state.page).toBe(2);
  expect(new URLSearchParams(location.search).get("page")).toBe("2");
  render().restoreTransit("sku");
  expect(state.transit).toEqual({});
});
it("resets scenario and overrides while retaining unrelated query parameters", () => {
  render().changeTransit("sku", "4");
  render().reset();
  expect(state).toEqual({ draft: { mode: "shortage", filters: {}, leadDays: "", coverDays: "" }, transit: {}, page: 1 });
  expect(location.search).toBe("?tab=demo");
});
it("normalizes monobrand controls without modifying the stored draft", () => {
  state.draft.mode = "brand";
  state.draft.filters.brandId = "b";
  expect(render(true).draft).toMatchObject({ mode: "all", filters: { supplierId: "s" } });
  expect(render(true).draft.filters.brandId).toBeUndefined();
  expect(state.draft.filters.brandId).toBe("b");
});
