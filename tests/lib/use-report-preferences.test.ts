import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { normalizeTablePreferences, type DataTableKey } from "@/lib/data-table-preferences";
import { useReportPreferences } from "@/components/data-reporting/use-report-preferences/use-report-preferences";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setPreferences = vi.fn(), setStates = vi.fn();
const preferences = normalizeTablePreferences({});
const next = { visibleColumns: ["sku", "stock"], pageSize: 25, sortColumn: "stock", sortDirection: "desc" as const };

function start(key: DataTableKey = "product_yml") {
  vi.mocked(useState).mockReturnValueOnce([preferences, setPreferences]).mockReturnValueOnce([{}, setStates]);
  vi.mocked(useRef).mockReturnValueOnce({ current: {} });
  const state = useReportPreferences({}, key);
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { ...state, cleanup };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiFetch).mockReset(); });

it("optimistically updates only the selected preference and saves through the shared fetcher", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("{}"));
  const state = start("by_brand");
  expect(state.preference).toBe(preferences.by_brand);
  expect(state.saveState).toBe("idle");
  await state.updatePreference(next);
  expect(apiFetch).toHaveBeenCalledWith("/api/data/preferences/by_brand", expect.objectContaining({ method: "PUT", body: JSON.stringify(next), signal: expect.any(AbortSignal) }));
  expect(setPreferences.mock.calls[0][0](preferences)).toEqual({ ...preferences, by_brand: next });
  expect(setStates.mock.calls[0][0]({ article_report: "saving" })).toEqual({ article_report: "saving", by_brand: "saving" });
  expect(setStates.mock.calls[1][0]({ article_report: "error" })).toEqual({ article_report: "error", by_brand: "saved" });
});

it("cancels a superseded save and ignores its delayed completion", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(new Response("{}"));
  const state = start();
  const first = state.updatePreference(next);
  await state.updatePreference({ ...next, pageSize: 100 });
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  setStates.mockClear();
  finish(new Response("{}")); await first;
  expect(setStates).not.toHaveBeenCalled();
});

it.each(["http", "network"])("sets an error only for the affected table on %s failure", async failure => {
  if (failure === "http") vi.mocked(apiFetch).mockResolvedValueOnce(new Response("{}", { status: 500 }));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error());
  await start("article_report").updatePreference(next);
  const update = setStates.mock.lastCall![0];
  expect(update({ by_brand: "saved" })).toEqual({ by_brand: "saved", article_report: "error" });
});

it("aborts pending writes on unmount and ignores a later response", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.updatePreference(next);
  state.cleanup?.();
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  setStates.mockClear();
  finish(new Response("{}")); await pending;
  expect(setStates).not.toHaveBeenCalled();
});

it("resets only the requested tab's save indicator", () => {
  start().resetSaveState("by_category");
  expect(setStates.mock.calls[0][0]({ product_yml: "saving", by_category: "saved" })).toEqual({ product_yml: "saving", by_category: "idle" });
});
