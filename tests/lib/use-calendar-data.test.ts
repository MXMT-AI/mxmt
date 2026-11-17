import { useEffect, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useCalendarData } from "@/components/calendar/marketing-calendar/use-calendar-data";

vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useEffect: vi.fn() }));
const setStock = vi.fn(), setInsights = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function start() {
  vi.mocked(useState).mockReturnValueOnce([[], setStock]).mockReturnValueOnce([[], setInsights]);
  useCalendarData();
  return vi.mocked(useEffect).mock.lastCall![0]();
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiFetch).mockReset(); });

it("loads both resources independently and replaces demo data with valid empty results", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(response([]));
  start();
  expect(apiFetch).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(setInsights).toHaveBeenCalledWith([]));
  expect(setStock).not.toHaveBeenCalled();
  finish(response([]));
  await vi.waitFor(() => expect(setStock).toHaveBeenCalledWith([]));
  expect(apiFetch).toHaveBeenCalledWith("/api/calendar/stock", expect.objectContaining({ signal: expect.any(AbortSignal), cache: "no-store" }));
});

it.each(["http", "shape", "network"])("isolates a %s failure from the other resource", async failure => {
  if (failure === "network") vi.mocked(apiFetch).mockRejectedValueOnce(new Error());
  else vi.mocked(apiFetch).mockResolvedValueOnce(failure === "http" ? response([], 500) : response({ error: "Invalid" }));
  const insights = [{ type: "agent", brand: "Demo", title: "Review" }];
  vi.mocked(apiFetch).mockResolvedValueOnce(response(insights));
  start();
  await vi.waitFor(() => expect(setInsights).toHaveBeenCalledWith(insights));
  expect(setStock).not.toHaveBeenCalled();
});

it("cancels both requests and ignores results after unmount", async () => {
  const finish: ((response: Response) => void)[] = [];
  vi.mocked(apiFetch).mockImplementation(() => new Promise(resolve => { finish.push(resolve); }));
  const cleanup = start();
  cleanup?.();
  for (const call of vi.mocked(apiFetch).mock.calls) expect(call[1]?.signal?.aborted).toBe(true);
  for (const resolve of finish) resolve(response([]));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setStock).not.toHaveBeenCalled();
  expect(setInsights).not.toHaveBeenCalled();
});
