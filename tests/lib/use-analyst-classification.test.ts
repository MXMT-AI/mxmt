import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/fetch";
import { useAnalystClassification } from "@/components/analyst/analyst-app/use-analyst-classification";

vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: vi.fn(), useRef: vi.fn(), useEffect: vi.fn() }));

const summary = { total: 1, hit: 1, stockout: 0, slow: 0, dead: 0, ok: 0 };
const setSkus = vi.fn(), setSummary = vi.fn(), setLoading = vi.fn(), setError = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function start() {
  vi.mocked(useState).mockReturnValueOnce([[], setSkus]).mockReturnValueOnce([summary, setSummary])
    .mockReturnValueOnce([false, setLoading]).mockReturnValueOnce([false, setError]);
  vi.mocked(useRef).mockReturnValueOnce({ current: 0 });
  const state = useAnalystClassification([], summary);
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { ...state, cleanup };
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(apiFetch).mockReset(); });

it("uses the shared fetcher and updates the filtered rows and global summary", async () => {
  vi.mocked(apiFetch).mockImplementation(async () => response({ skus: [], summary }));
  const state = start();
  await state.reload("hit");
  expect(apiFetch).toHaveBeenCalledWith("/api/analyst/classify?flag=hit");
  expect(setSkus).toHaveBeenCalledWith([]);
  expect(setSummary).toHaveBeenCalledWith(summary);
  expect(setLoading.mock.calls).toEqual([[true], [false]]);
  await state.reload("all");
  expect(apiFetch).toHaveBeenLastCalledWith("/api/analyst/classify");
  expect(setError).toHaveBeenLastCalledWith(false);
});

it.each(["http", "network", "shape", "summary"])("preserves previous data on %s failure and permits retry", async failure => {
  if (failure === "network") vi.mocked(apiFetch).mockRejectedValueOnce(new Error());
  else vi.mocked(apiFetch).mockResolvedValueOnce(
    failure === "http" ? response({ error: "Unavailable" }, 503)
      : failure === "shape" ? response({ skus: [] })
        : response({ skus: [], summary: { ...summary, total: null } }),
  );
  const state = start();
  await state.reload("all");
  expect(setError).toHaveBeenLastCalledWith(true);
  expect(setLoading).toHaveBeenLastCalledWith(false);
  expect(setSkus).not.toHaveBeenCalled();
  expect(setSummary).not.toHaveBeenCalled();
  vi.mocked(apiFetch).mockResolvedValueOnce(response({ skus: [], summary }));
  await state.reload("all");
  expect(setError).toHaveBeenLastCalledWith(false);
  expect(setSummary).toHaveBeenCalledWith(summary);
});

it.each([false, true])("ignores a superseded response, including its loading and error state (failure: %s)", async failure => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(response({ skus: [], summary: { ...summary, total: 2 } }));
  const state = start();
  const old = state.reload("hit");
  await state.reload("stockout");
  setLoading.mockClear(); setError.mockClear();
  finish(response({ skus: [], summary }, failure ? 500 : 200));
  await old;
  expect(setSummary).toHaveBeenCalledExactlyOnceWith({ ...summary, total: 2 });
  expect(setSkus).toHaveBeenCalledOnce();
  expect(setLoading).not.toHaveBeenCalled();
  expect(setError).not.toHaveBeenCalled();
});

it("ignores a result after unmount", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const state = start();
  const pending = state.reload("all");
  state.cleanup?.();
  setLoading.mockClear(); setError.mockClear();
  finish(response({ skus: [], summary }));
  await pending;
  expect(setSkus).not.toHaveBeenCalled();
  expect(setSummary).not.toHaveBeenCalled();
  expect(setError).not.toHaveBeenCalled();
  expect(setLoading).not.toHaveBeenCalled();
});
