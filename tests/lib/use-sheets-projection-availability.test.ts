import { useEffect, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { selectedSheetsProjectionIntent } from "@/lib/client/sheets-reporting";
import { useSheetsProjectionAvailability } from "@/components/data-reporting/use-sheets-projection-availability/use-sheets-projection-availability";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/client/sheets-reporting", () => ({ selectedSheetsProjectionIntent: vi.fn() }));
const setResult = vi.fn();
const intent = { path: "/api/connectors/sheets/projection/demo", intent: { importRunId: "run" } };

function start(enabled = true, version = 0, result: { key: string; available: boolean } | null = null) {
  vi.mocked(useState).mockReturnValueOnce([result, setResult]);
  const available = useSheetsProjectionAvailability(enabled, version);
  const effect = vi.mocked(useEffect).mock.lastCall![0];
  return { available, effect };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.mocked(selectedSheetsProjectionIntent).mockReset();
});

it("does not request an intent without permission", () => {
  const state = start(false);
  expect(state.available).toBe(false);
  expect(state.effect()).toBeUndefined();
  expect(selectedSheetsProjectionIntent).not.toHaveBeenCalled();
});

it.each([false, true])("resolves availability for a selected Sheets source (%s)", async selected => {
  vi.mocked(selectedSheetsProjectionIntent).mockResolvedValueOnce(selected ? intent : null);
  const state = start();
  expect(state.available).toBe(false);
  state.effect();
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledWith({ key: "true:0", available: selected }));
});

it("passes cancellation and no-store options through the shared fetcher", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response("{}"));
  vi.mocked(selectedSheetsProjectionIntent).mockImplementationOnce(async fetcher => {
    await fetcher!("/api/connectors/source", { method: "GET" });
    return intent;
  });
  const cleanup = start().effect();
  await vi.waitFor(() => expect(setResult).toHaveBeenCalled());
  expect(apiFetch).toHaveBeenCalledWith("/api/connectors/source", { method: "GET", cache: "no-store", signal: expect.any(AbortSignal) });
  cleanup?.();
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it("disables refresh after an intent failure", async () => {
  vi.mocked(selectedSheetsProjectionIntent).mockRejectedValueOnce(new Error());
  start().effect();
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledWith({ key: "true:0", available: false }));
});

it("ignores a result after cleanup", async () => {
  let finish!: (result: typeof intent) => void;
  vi.mocked(selectedSheetsProjectionIntent).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const cleanup = start().effect(); cleanup?.();
  finish(intent);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setResult).not.toHaveBeenCalled();
});

it("does not reuse the previous refresh permission for a new reload", () => {
  expect(start(true, 1, { key: "true:0", available: true }).available).toBe(false);
  expect(start(true, 1, { key: "true:1", available: true }).available).toBe(true);
  expect(start(false, 1, { key: "true:1", available: true }).available).toBe(false);
});
