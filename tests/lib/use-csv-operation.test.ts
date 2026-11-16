import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCsvOperation } from "@/components/settings/csv-import-card/use-csv-operation";
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useRef: vi.fn(), useState: vi.fn() }));
const setBusy = vi.fn(), onError = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.mocked(useRef).mockReturnValue({ current: false }); vi.mocked(useState).mockReturnValue([false, setBusy]); });
it("blocks overlapping operations before a render and unlocks after completion", async () => {
  let finish!: () => void;
  const first = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const second = vi.fn();
  const { run } = useCsvOperation(true);
  const pending = run(first, onError);
  await run(second, onError);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  expect(setBusy).toHaveBeenCalledWith(true);
  expect(setBusy).not.toHaveBeenCalledWith(false);
  finish();
  await pending;
  await run(second, onError);
  expect(second).toHaveBeenCalledOnce();
  expect(setBusy).toHaveBeenLastCalledWith(false);
});
it.each(["sync", "async"])("reports %s failures and allows retry", async type => {
  const error = new Error("CSV_EXPIRED");
  const task = type === "sync" ? () => { throw error; } : async () => { throw error; };
  const { run } = useCsvOperation(true);
  await run(task, onError);
  expect(onError).toHaveBeenCalledWith(error);
  expect(setBusy).toHaveBeenLastCalledWith(false);
  const retry = vi.fn();
  await run(retry, onError);
  expect(retry).toHaveBeenCalledOnce();
});
it("does not run or change busy state without management rights", async () => {
  const task = vi.fn();
  await useCsvOperation(false).run(task, onError);
  expect(task).not.toHaveBeenCalled();
  expect(setBusy).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
it("unlocks even if the error handler throws", async () => {
  const { run } = useCsvOperation(true);
  await expect(run(() => { throw new Error("task"); }, () => { throw new Error("handler"); })).rejects.toThrow("handler");
  expect(setBusy).toHaveBeenLastCalledWith(false);
  const next = vi.fn();
  await run(next, onError);
  expect(next).toHaveBeenCalledOnce();
});
