import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useCalendarAiPlan } from "@/components/calendar/marketing-calendar/use-calendar-ai-plan";

vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn() }));
const setChips = vi.fn(), setLoading = vi.fn(), setError = vi.fn();
const chip = { weekKey: "w47", rowKey: "accent", label: "Launch", type: "promo" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function start() {
  vi.mocked(useState).mockReturnValueOnce([[], setChips]).mockReturnValueOnce([false, setLoading]).mockReturnValueOnce([false, setError]);
  vi.mocked(useRef).mockReturnValueOnce({ current: false });
  return useCalendarAiPlan();
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiFetch).mockReset(); });

it("stores a valid plan and signals that the agent tab should open", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response({ chips: [chip] }));
  expect(await start().generate()).toBe(true);
  expect(apiFetch).toHaveBeenCalledExactlyOnceWith("/api/calendar/ai-plan", { method: "POST" });
  expect(setChips).toHaveBeenCalledWith([chip]);
  expect(setLoading.mock.calls).toEqual([[true], [false]]);
});

it("clears the previous plan for a valid empty result without requesting a tab change", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response({ chips: [] }));
  expect(await start().generate()).toBe(false);
  expect(setChips).toHaveBeenCalledWith([]);
  expect(setError.mock.calls).toEqual([[false]]);
});

it("blocks concurrent generation before React rerenders", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const state = start();
  const first = state.generate();
  expect(await state.generate()).toBe(false);
  expect(apiFetch).toHaveBeenCalledOnce();
  finish(response({ chips: [chip] }));
  expect(await first).toBe(true);
});

it.each([
  { chips: [], error: "AI_INVALID_RESPONSE" },
  { chips: null },
  { chips: [{ ...chip, type: "unknown" }] },
  { chips: [{ ...chip, label: null }] },
])("rejects malformed or failed plans and keeps existing chips (%j)", async body => {
  vi.mocked(apiFetch).mockResolvedValueOnce(response(body));
  expect(await start().generate()).toBe(false);
  expect(setError).toHaveBeenLastCalledWith(true);
  expect(setLoading).toHaveBeenLastCalledWith(false);
  expect(setChips).not.toHaveBeenCalled();
});

it.each(["http", "network"])("reports a %s failure and allows retry", async failure => {
  if (failure === "http") vi.mocked(apiFetch).mockResolvedValueOnce(response({ chips: [chip] }, 500));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error());
  const state = start();
  expect(await state.generate()).toBe(false);
  expect(setChips).not.toHaveBeenCalled();
  expect(setError).toHaveBeenLastCalledWith(true);
  vi.mocked(apiFetch).mockResolvedValueOnce(response({ chips: [chip] }));
  expect(await state.generate()).toBe(true);
  expect(setError).toHaveBeenLastCalledWith(false);
});
