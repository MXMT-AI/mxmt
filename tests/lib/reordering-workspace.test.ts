import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  initialReorderingState,
  readReorderingDraft,
  writeReorderingDraft,
  reorderingReducer,
  reorderingRequest,
} from "@/lib/reordering-workspace";
import { parseReorderingRequest } from "@/lib/reorder-calc";
const query = () =>
  new URLSearchParams(
    "snapshotId=frozen&period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=2&brandId=brand-a&categoryId=category&skuId=sku-1",
  );
describe("reordering intent and deep links", () => {
  it("preserves shared context and canonical drill-down IDs, inheriting supplier settings by default", () => {
    const state = initialReorderingState(query());
    expect(state.draft).toMatchObject({
      mode: "shortage",
      leadDays: "",
      coverDays: "",
      filters: { brandId: "brand-a", categoryId: "category", skuId: "sku-1" },
    });
    const next = writeReorderingDraft(query(), {
      ...state.draft,
      mode: "brand",
      leadDays: "45",
    });
    expect(next.get("channelId")).toBe("2");
    expect(next.get("snapshotId")).toBe("frozen");
    expect(readReorderingDraft(next)).toMatchObject({
      mode: "brand",
      leadDays: "45",
    });
  });
  it("serializes only scenario intent and lets the server reject malformed day values", () => {
    const state = initialReorderingState(
      new URLSearchParams("leadDays=0&coverDays=7&mode=brand&brandId=brand-a"),
    );
    const request = reorderingRequest("frozen", state);
    expect(parseReorderingRequest(request).parameters).toEqual({
      leadDays: 0,
      coverDays: 7,
    });
    expect(request).not.toHaveProperty("velocityPerWeek");
    expect(() =>
      parseReorderingRequest(
        reorderingRequest("frozen", {
          ...state,
          draft: { ...state.draft, leadDays: "3.5" },
        }),
      ),
    ).toThrow("INVALID_REORDERING_REQUEST");
    expect(
      reorderingRequest("frozen", initialReorderingState(new URLSearchParams()))
        .parameters,
    ).toEqual({});
  });
  it("preserves explicit zero across delivery terms and pagination, but clears confirmations for changed scope", () => {
    let state = initialReorderingState(query());
    state = reorderingReducer(state, {
      type: "transit",
      skuId: "sku-1",
      value: "0",
    });
    state = reorderingReducer(state, {
      type: "draft",
      draft: { ...state.draft, leadDays: "60" },
    });
    state = reorderingReducer(state, { type: "page", page: 2 });
    expect(reorderingRequest("frozen", state).overrides).toEqual([
      { skuId: "sku-1", inTransitQuantity: "0" },
    ]);
    state = reorderingReducer(state, {
      type: "draft",
      draft: { ...state.draft, filters: { brandId: "brand-b" } },
    });
    expect(state.transit).toEqual({});
    expect(state.page).toBe(1);
  });
  it("restores saved transit and resets transient confirmations on external navigation", () => {
    let state = initialReorderingState(query());
    state = reorderingReducer(state, {
      type: "transit",
      skuId: "sku-1",
      value: "-2",
    });
    expect(() =>
      parseReorderingRequest(reorderingRequest("frozen", state)),
    ).toThrow("INVALID_REORDERING_REQUEST");
    state = reorderingReducer(state, {
      type: "transit",
      skuId: "sku-1",
      value: "",
    });
    expect(reorderingRequest("frozen", state).overrides).toEqual([]);
    state = reorderingReducer(state, {
      type: "transit",
      skuId: "sku-1",
      value: "4",
    });
    expect(
      reorderingReducer(state, {
        type: "restore",
        query: "mode=brand&brandId=brand-b&page=3",
      }),
    ).toMatchObject({
      transit: {},
      page: 3,
      draft: { mode: "brand", filters: { brandId: "brand-b" } },
    });
  });
});

describe("URL restoration and editable transit regressions", () => {
  it.each(["abc", "0", "-1", "1.5", "100001", "", "Infinity"])(
    "restores invalid page=%s as page one",
    (page) => {
      const state = initialReorderingState(
        new URLSearchParams({ mode: "foo", page }),
      );
      expect(state.draft.mode).toBe("shortage");
      expect(state.page).toBe(1);
      expect(() =>
        parseReorderingRequest(reorderingRequest("frozen", state)),
      ).not.toThrow();
    },
  );
  it.each(["1", "100000"])("preserves valid brand mode and page=%s", (page) => {
    const state = initialReorderingState(
      new URLSearchParams({ mode: "brand", brandId: "brand-a", page }),
    );
    expect(state.draft.mode).toBe("brand");
    expect(state.page).toBe(Number(page));
  });
  it("keeps clearing separate from restore, and omits only empty drafts from API overrides", () => {
    let state = initialReorderingState(query());
    state = reorderingReducer(state, {
      type: "transit",
      skuId: "sku-1",
      value: "",
    });
    expect(Object.hasOwn(state.transit, "sku-1")).toBe(true);
    expect(state.transit["sku-1"]).toBe("");
    expect(reorderingRequest("frozen", state).overrides).toEqual([]);
    state = reorderingReducer(state, {
      type: "transit",
      skuId: "sku-1",
      value: "7",
    });
    expect(reorderingRequest("frozen", state).overrides).toEqual([
      { skuId: "sku-1", inTransitQuantity: "7" },
    ]);
    state = reorderingReducer(state, {
      type: "restoreTransit",
      skuId: "sku-1",
    });
    expect(Object.hasOwn(state.transit, "sku-1")).toBe(false);
  });
});
