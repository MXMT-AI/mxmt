import { useEffect, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useSheetsMappingData } from "@/components/settings/sheets-mapping-card/use-sheets-mapping-data";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useState: vi.fn(), useEffectEvent: (callback: unknown) => callback }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
const setSources = vi.fn(), setMeta = vi.fn(), setDraft = vi.fn(), setSourcesLoading = vi.fn(), setLoading = vi.fn(), onReset = vi.fn(), onError = vi.fn();
const metadata = { revision: 3, input: { importRunId: "import" }, suggestion: { version: 1 } };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function start(options = {}) {
  vi.mocked(useState).mockReturnValueOnce([[], setSources]).mockReturnValueOnce([null, setMeta]).mockReturnValueOnce([null, setDraft])
    .mockReturnValueOnce([true, setSourcesLoading]).mockReturnValueOnce([false, setLoading]);
  const state = useSheetsMappingData({ canManage: true, sourceId: "tenant&sheet", reload: 2, lang: "en", onReset, onError, ...options });
  return { state, effects: vi.mocked(useEffect).mock.calls.slice(-2).map(call => call[0]) };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiFetch).mockImplementation(async () => response({ connections: [] })); });
it("loads only Google Sheets sources and supports cancelling the request", async () => {
  const sheets = { provider: "sheets", sourceId: "sheet" };
  vi.mocked(apiFetch).mockResolvedValueOnce(response({ connections: [sheets, { provider: "csv", sourceId: "csv" }] }));
  const { effects } = start(), cleanup = effects[0]();
  await vi.waitFor(() => expect(setSources).toHaveBeenCalledWith([sheets]));
  expect(setSourcesLoading.mock.calls).toEqual([[true], [false]]);
  cleanup?.();
  expect(vi.mocked(apiFetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
});
it("clears previous drafts and approval before loading selected source metadata", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response(metadata));
  const { effects } = start();
  effects[1]();
  expect(setMeta).toHaveBeenCalledWith(null);
  expect(setDraft).toHaveBeenCalledWith(null);
  expect(onReset).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(setLoading).toHaveBeenLastCalledWith(false));
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/sheets/mapping/tenant%26sheet", { signal: expect.any(AbortSignal) });
  expect(setMeta).toHaveBeenLastCalledWith(metadata);
  expect(setDraft).toHaveBeenLastCalledWith(metadata.suggestion);
  expect(vi.mocked(useEffect).mock.lastCall![1]).toEqual(["tenant&sheet", 2, true, false]);
});
it.each([{ sourceId: "" }, { canManage: false }])("does not request mapping with %j", options => {
  const { effects } = start(options);
  effects[1]();
  expect(apiFetch).not.toHaveBeenCalled();
  expect(onReset).toHaveBeenCalledOnce();
  expect(setLoading).toHaveBeenCalledWith(false);
  if ("canManage" in options) { effects[0](); expect(apiFetch).not.toHaveBeenCalled(); }
});
it("does not restore an old draft or report errors after cancellation", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { effects } = start(), cleanup = effects[1]();
  cleanup?.();
  finish(response(metadata));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setMeta).toHaveBeenCalledExactlyOnceWith(null);
  expect(setDraft).toHaveBeenCalledExactlyOnceWith(null);
  expect(setLoading).toHaveBeenCalledExactlyOnceWith(true);
  expect(onError).toHaveBeenCalledExactlyOnceWith("");
});
it.each(["uk", "en"] as const)("localizes source-load failure in %s", lang => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response({}, 503));
  const { effects } = start({ lang });
  effects[0]();
  return vi.waitFor(() => expect(onError).toHaveBeenLastCalledWith(lang === "uk" ? "Не вдалося завантажити таблиці." : "Could not load spreadsheets."));
});
