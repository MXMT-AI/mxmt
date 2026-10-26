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
