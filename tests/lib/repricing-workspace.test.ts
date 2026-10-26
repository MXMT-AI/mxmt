import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  readRepricingDraft,
  writeRepricingDraft,
  initialRepricingState,
  repricingWorkspaceReducer,
  LatestRepricingRequest,
  activeRepricingFilters,
} from "@/lib/repricing-workspace";
import { parseRepricingRequest, calculateRepricing } from "@/lib/repricing";
import { repricingUiSkus } from "../helpers/repricing-workspace";
const base = () => readRepricingDraft(new URLSearchParams());
describe("Repricing intent, navigation and request ordering", () => {
  it("restores defaults and brand/status deep links, while preserving invalid values for server validation", () => {
    expect(base().filters).toEqual({
      status: "DEAD",
      soldMonths: 3,
      currency: "UAH",
    });
    expect(
      readRepricingDraft(
        new URLSearchParams("brandId=brand-a&classification=RISK"),
      ).filters,
    ).toMatchObject({ brandId: "brand-a", status: "RISK" });
    expect(() =>
      parseRepricingRequest({
        inputSetId: "inputs",
        ...readRepricingDraft(
          new URLSearchParams("minDiscountPct=35&maxDiscountPct=20"),
        ),
      }),
    ).toThrow("INVALID_REPRICING_REQUEST");
  });
  it("round-trips controls without discarding shared context or leaking manual edits into URLs", () => {
    const query = new URLSearchParams(
      "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=2&snapshotId=frozen&classification=RISK&page=9",
    );
    const draft = readRepricingDraft(query);
    draft.parameters.goal = "SEASON";
    draft.filters.soldMax = "2";
    const next = writeRepricingDraft(query, draft);
    expect(readRepricingDraft(next)).toEqual(draft);
    expect(next.get("snapshotId")).toBe("frozen");
    expect(next.get("channelId")).toBe("2");
    expect(next.has("classification")).toBe(false);
    expect(next.has("page")).toBe(false);
    expect(activeRepricingFilters(draft.filters)).toBe(2);
  });
  it("resets manual prices and inclusions for filters, sliders, goals, duration and liquidation parameters", () => {
    let state = initialRepricingState(base());
    state = repricingWorkspaceReducer(state, {
      type: "price",
      skuId: "sku",
      price: "250.01",
    });
    state = repricingWorkspaceReducer(state, {
      type: "selection",
      skuId: "sku",
      included: true,
    });
    state = repricingWorkspaceReducer(state, { type: "page", page: 2 });
    expect(state.edits.manualPrices).toHaveLength(1);
    for (const draft of [
      { ...base(), filters: { ...base().filters, brandId: "new" } },
      ...(
        [
          "sharePct",
          "goal",
          "durationDays",
          "costProtection",
          "liquidationReason",
        ] as const
      ).map((key) => ({
        ...base(),
        parameters: {
          ...base().parameters,
          [key]:
            key === "goal"
              ? "SEASON"
              : key === "costProtection"
                ? false
                : key === "liquidationReason"
                  ? "reason"
                  : 10,
        },
      })),
    ]) {
      const reset = repricingWorkspaceReducer(state, { type: "draft", draft });
      expect(reset.edits).toEqual({ selection: [], manualPrices: [] });
      expect(reset.page).toBe(1);
    }
  });
  it("can restore an automatic price without clearing other selected rows", () => {
    let state = initialRepricingState(base());
    state = repricingWorkspaceReducer(state, {
      type: "price",
      skuId: "a",
      price: "",
    });
    state = repricingWorkspaceReducer(state, {
      type: "selection",
      skuId: "b",
      included: true,
    });
    state = repricingWorkspaceReducer(state, {
      type: "price",
      skuId: "a",
      price: null,
    });
    expect(state.edits).toEqual({
      manualPrices: [],
      selection: [{ skuId: "b", included: true }],
    });
  });
  it("ignores older responses even when the transport resolves after abort", async () => {
    const latest = new LatestRepricingRequest();
    let resolveOld!: (value: string) => void;
    const old = latest.start();
    const response = new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
    let visible = "";
    const oldDone = response.then((v) => {
      if (old.isCurrent()) visible = v;
    });
    const current = latest.start();
    expect(old.signal.aborted).toBe(true);
    if (current.isCurrent()) visible = "new";
    resolveOld("stale");
    await oldDone;
    expect(visible).toBe("new");
    current.cancel();
    expect(current.isCurrent()).toBe(false);
    expect(current.signal.aborted).toBe(true);
  });
  it("exposes frozen filter choices before filtering and uses the backend selected snapshot", () => {
    const r = calculateRepricing(
      {
        id: "inputs",
        snapshotId: "frozen",
        asOf: "2026-10-25",
        rows: repricingUiSkus,
      },
      parseRepricingRequest({
        inputSetId: "inputs",
        filters: { brandId: "brand-a" },
      }),
    );
    expect(r.filterOptions.brands).toEqual([
      { id: "brand-a", name: "Time Studio" },
      { id: "brand-b", name: "Field Works" },
    ]);
    expect(r.rows.every((r) => r.brandId === "brand-a")).toBe(true);
    expect(r.snapshotId).toBe("frozen");
  });
});
describe("debounced preview transport", () => {
  it("waits 250ms, cancels superseded work, and never publishes late success or failure", async () => {
    vi.useFakeTimers();
    try {
      const latest = new LatestRepricingRequest(),
        commit = vi.fn(),
        fail = vi.fn();
      let resolveOld!: (v: string) => void, oldSignal: AbortSignal | undefined;
      const loadOld = vi.fn((signal: AbortSignal) => {
        oldSignal = signal;
        return new Promise<string>((resolve) => {
          resolveOld = resolve;
        });
      });
      const cancelOld = latest.schedule(loadOld, commit, fail);
      await vi.advanceTimersByTimeAsync(249);
      expect(loadOld).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(loadOld).toHaveBeenCalledTimes(1);
      cancelOld();
      latest.schedule(async () => "new", commit, fail);
      expect(oldSignal!.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(250);
      resolveOld("obsolete");
      await Promise.resolve();
      expect(commit.mock.calls).toEqual([["new"]]);
      expect(fail).not.toHaveBeenCalled();
      const rapid = vi.fn(async () => "should not start");
      const cancel = latest.schedule(rapid, commit, fail);
      cancel();
      latest.schedule(async () => "latest", commit, fail);
      await vi.advanceTimersByTimeAsync(250);
      expect(rapid).not.toHaveBeenCalled();
      expect(commit).toHaveBeenLastCalledWith("latest");
      let rejectOld!: (error: Error) => void;
      latest.schedule(
        () =>
          new Promise<string>((_, reject) => {
            rejectOld = reject;
          }),
        commit,
        fail,
      );
      await vi.advanceTimersByTimeAsync(250);
      latest.schedule(async () => "final", commit, fail);
      rejectOld(new Error("late failure"));
      await vi.advanceTimersByTimeAsync(250);
      expect(fail).not.toHaveBeenCalled();
      expect(commit).toHaveBeenLastCalledWith("final");
      latest.cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});
