import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useReportTable } from "@/components/data-reporting/use-report-table";
import { normalizeTablePreferences } from "@/lib/data-table-preferences";

vi.mock("react", async (load) => ({
  ...await load<typeof import("react")>(),
  useEffect: vi.fn(),
  useState: vi.fn(),
}));

const defaultArgs = {
  activeTab: "product_yml" as const,
  page: 5,
  preference: normalizeTablePreferences({}).product_yml,
  reloadVersion: 0,
  search: "",
  onPageChange: vi.fn(),
};
const setResult = vi.fn();

function start(args: Parameters<typeof useReportTable>[0]) {
  const state = useReportTable(args);
  const effect = vi.mocked(useEffect).mock.lastCall![0];
  const cleanup = effect();
  return { state, cleanup };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useState).mockReturnValue([null, setResult]);
});
afterEach(() => vi.unstubAllGlobals());

it.each(["success", "failure"])("ignores a cancelled request's delayed %s after switching tables", async (outcome) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const fetchMock = vi.fn()
    .mockImplementationOnce(async () => {
      await delayed;
      if (outcome === "failure") throw new Error("Old request failed");
      return Response.json({ pagination: { totalPages: 1 }, rows: ["old"] });
    })
    .mockResolvedValueOnce(Response.json({ pagination: { totalPages: 3 }, rows: ["new"] }));
  vi.stubGlobal("fetch", fetchMock);

  const first = start(defaultArgs);
  first.cleanup?.();
  start({ ...defaultArgs, activeTab: "by_brand" });
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledOnce());
  release();
  await delayed;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(setResult).toHaveBeenCalledOnce();
  expect(setResult.mock.calls[0][0].table.rows).toEqual(["new"]);
  expect(defaultArgs.onPageChange.mock.calls).toEqual([[3]]);
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
});

it("includes search, sorting and page size in the request and hides a result for a previous query", async () => {
  vi.mocked(useState).mockReturnValue([{ key: "previous", table: { rows: ["stale"] }, error: null }, setResult]);
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ pagination: { totalPages: 4 }, rows: [] }));
  vi.stubGlobal("fetch", fetchMock);
  const { state } = start({
    ...defaultArgs,
    page: 2,
    search: "Test & SKU",
    preference: { visibleColumns: ["name"], pageSize: 100, sortColumn: "name", sortDirection: "desc" },
  });
  expect(state).toEqual({ table: null, error: null, loading: true });
  const url = new URL(fetchMock.mock.calls[0][0], "https://app.test");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    page: "2", pageSize: "100", direction: "desc", search: "Test & SKU", sort: "name",
  });
  await vi.waitFor(() => expect(setResult).toHaveBeenCalledOnce());
});
