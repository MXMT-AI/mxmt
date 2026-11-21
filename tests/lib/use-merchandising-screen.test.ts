import { useEffect, useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
import { apiFetch } from "@/lib/fetch";
const context = vi.hoisted(() => ({ query: "snapshotId=pinned&brandId=b&channelId=2", replace: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn(), useState: vi.fn() }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: context.replace }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(context.query) }));
const filters = { period: "month" as const, dateFrom: "2026-09-01", dateTo: "2026-09-30", channelId: "2" };
const report = (snapshotId = "pinned") => ({ context: { snapshotId, period: { from: filters.dateFrom, to: filters.dateTo }, asOf: "2026-10-01" } });
const setResult = vi.fn(), setError = vi.fn(), setBusy = vi.fn(), setReload = vi.fn();
let force: { current: boolean }, loaded: { current: string };
function start(
  previousError: unknown = null,
  reload = 0,
  selection: Parameters<typeof useMerchandisingScreen>[0] = filters,
) {
  vi.mocked(useState).mockReturnValueOnce([null, setResult]).mockReturnValueOnce([previousError, setError]).mockReturnValueOnce([true, setBusy]).mockReturnValueOnce([reload, setReload]);
  vi.mocked(useRef).mockReturnValueOnce(force).mockReturnValueOnce(loaded);
  const state = useMerchandisingScreen(selection, "sales", { groupBy: "sku" });
  const cleanup = vi.mocked(useEffect).mock.lastCall![0]();
  return { state, cleanup };
}
beforeEach(() => {
  vi.clearAllMocks();
  context.query = "snapshotId=pinned&brandId=b&channelId=2";
  force = { current: false }; loaded = { current: "" };
  vi.mocked(apiFetch).mockResolvedValue(Response.json(report()));
});
it("reads an existing snapshot without creating one or changing the URL", async () => {
  start();
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledOnce());
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/merchandising/sales?snapshotId=pinned&brandId=b&channelId=2&groupBy=sku");
  expect(context.replace).not.toHaveBeenCalled();
});
it.each(["missing", "refresh"])("creates a snapshot for %s and preserves URL context", async mode => {
  if (mode === "missing") context.query = "brandId=b&channelId=2";
  else {
    const first = start();
    await vi.waitFor(() => expect(setResult).toHaveBeenCalledOnce());
    first.state.refresh(); first.cleanup?.();
    expect(force.current).toBe(true);
    expect(setReload.mock.calls[0][0](2)).toBe(3);
    vi.mocked(apiFetch).mockClear(); setResult.mockClear();
  }
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ snapshotId: "new" })).mockResolvedValueOnce(Response.json(report("new")));
  start();
  await vi.waitFor(() => expect(context.replace).toHaveBeenCalledOnce());
  expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/api/merchandising/snapshots");
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string)).toEqual({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  const url = new URL(context.replace.mock.calls[0][0], "https://example.test");
  expect(url.searchParams.get("snapshotId")).toBe("new");
  expect(url.searchParams.get("brandId")).toBe("b");
  expect(url.searchParams.get("channelId")).toBe("2");
  expect(context.replace.mock.calls[0][1]).toEqual({ scroll: false });
});
it.each(["period", "asOf", "snapshotId"])("rejects a report with a mismatched %s", async mismatch => {
  if (mismatch === "asOf") context.query += "&asOf=2026-10-02";
  const data = report();
  if (mismatch === "period") data.context.period.to = "2026-09-29";
  if (mismatch === "snapshotId") data.context.snapshotId = "other";
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(data));
  start();
  await vi.waitFor(() => expect(setError).toHaveBeenCalledWith(expect.objectContaining({ message: "SCREEN_SELECTION_MISMATCH" })));
  expect(setResult).not.toHaveBeenCalled();
  expect(context.replace).not.toHaveBeenCalled();
});

it("does not fetch a report when a cancelled snapshot request resolves late", async () => {
  context.query = "brandId=b&channelId=2";
  let resolveSnapshot!: (response: Response) => void;
  vi.mocked(apiFetch).mockReturnValueOnce(new Promise<Response>((resolve) => {
    resolveSnapshot = resolve;
  }));

  const request = start();
  request.cleanup?.();
  resolveSnapshot(Response.json({ snapshotId: "late" }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(apiFetch).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledWith("/api/merchandising/snapshots", expect.objectContaining({
    signal: expect.objectContaining({ aborted: true }),
  }));
  expect(setResult).not.toHaveBeenCalled();
  expect(context.replace).not.toHaveBeenCalled();
});

it("reports an error when the snapshot response has no ID", async () => {
  context.query = "brandId=b";
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}));

  start();

  await vi.waitFor(() => expect(setError).toHaveBeenCalledWith(expect.objectContaining({ message: "SCREEN_DATA_UNAVAILABLE" })));
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(context.replace).not.toHaveBeenCalled();
});

it.each(["filter", "snapshot", "retry"])("scopes an error to the failed request when changing %s", async change => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ code: "FAILED" }, { status: 500 }));
  const first = start();
  await vi.waitFor(() => expect(setError).toHaveBeenCalledWith(expect.objectContaining({ message: "FAILED" })));
  const failure = setError.mock.lastCall![0];
  first.cleanup?.();
  const sameRequest = start(failure);
  expect(sameRequest.state.error).toBe("FAILED");
  sameRequest.cleanup?.();

  if (change === "filter") context.query = context.query.replace("brandId=b", "brandId=other");
  if (change === "snapshot") context.query = context.query.replace("snapshotId=pinned", "snapshotId=new");
  const next = start(failure, change === "retry" ? 1 : 0);
  expect(next.state.error).toBe("");
  next.cleanup?.();
});
it.each([false, true])("ignores a cancelled delayed report (failure: %s)", async failure => {
  let release!: () => void;
  vi.mocked(apiFetch).mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { release = resolve; });
    if (failure) throw new Error("Network failed");
    return Response.json(report());
  });
  const first = start(); first.cleanup?.();
  expect(vi.mocked(apiFetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
  setError.mockClear(); setBusy.mockClear();
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(setResult).not.toHaveBeenCalled();
  expect(setError).not.toHaveBeenCalled();
  expect(setBusy).not.toHaveBeenCalled();
  expect(context.replace).not.toHaveBeenCalled();
});

it("opens the published period directly without requesting a new calculation", async () => {
  context.query = "";
  vi.mocked(apiFetch).mockResolvedValue(Response.json({
    ...report(), publishedAt: "2026-10-01T09:00:00Z",
  }));
  start(null, 0, { ...filters, publishedSnapshotId: "pinned", publishedAsOf: "2026-10-01" });
  await vi.waitFor(() => expect(context.replace).toHaveBeenCalledOnce());
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledWith("/api/merchandising/sales?snapshotId=pinned&groupBy=sku", expect.objectContaining({ cache: "no-store" }));
  const url = new URL(context.replace.mock.calls[0][0], "https://example.test");
  expect(url.searchParams.get("asOf")).toBe("2026-10-01");
  expect(url.searchParams.get("snapshotId")).toBe("pinned");
});

it("re-reads ready data when the same snapshot is first published", async () => {
  const first = start();
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledOnce());
  first.cleanup?.();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({
    ...report(), publishedAt: "2026-10-01T09:00:00Z",
  }));

  start(null, 0, { ...filters, publishedVersion: "publication" });
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledTimes(2));
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(setResult.mock.lastCall?.[0].data.publishedAt).toBe("2026-10-01T09:00:00Z");
});
