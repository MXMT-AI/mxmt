import { afterEach, expect, it, vi } from "vitest";
import { scheduleRawImportStatusCheck } from "@/lib/client/raw-import-status";
import { RAW_IMPORT_MAX_RUNTIME_MS } from "@/lib/data-import-policy";

afterEach(() => vi.useRealTimers());

function setup(age = 0, status = "RUNNING") {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
  const run = { status, createdAt: new Date(Date.now() - age).toISOString() };
  const poll = vi.fn();
  const expired = vi.fn();
  const cancel = scheduleRawImportStatusCheck(run, poll, expired);
  return { poll, expired, cancel };
}

it("checks status once after ten seconds without overlapping requests", () => {
  const { poll, expired } = setup();
  vi.advanceTimersByTime(30000);
  expect(poll).toHaveBeenCalledTimes(1);
  expect(expired).not.toHaveBeenCalled();
});

it("updates expiry at the deadline without requesting status", () => {
  const { poll, expired } = setup(RAW_IMPORT_MAX_RUNTIME_MS - 500);
  vi.advanceTimersByTime(499);
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expired).toHaveBeenCalledTimes(1);
  expect(poll).not.toHaveBeenCalled();
});

it.each([[RAW_IMPORT_MAX_RUNTIME_MS, "RUNNING"], [0, "SUCCESS"]])(
  "does not poll expired or terminal claims (%s, %s)", (age, status) => {
    const { poll, expired } = setup(age, status);
    vi.runAllTimers();
    expect(poll).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  },
);

it("cancels a pending check on cleanup", () => {
  const { poll, expired, cancel } = setup();
  cancel();
  vi.runAllTimers();
  expect(poll).not.toHaveBeenCalled();
  expect(expired).not.toHaveBeenCalled();
});
