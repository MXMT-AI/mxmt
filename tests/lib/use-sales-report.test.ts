import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSalesReport } from "@/components/data-reporting/use-sales-report";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  deps: undefined as readonly unknown[] | undefined,
  cleanup: undefined as undefined | (() => void),
  pending: undefined as undefined | (() => void | (() => void)),
  fetch: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    if (!hooks.deps || deps.some((value, index) => value !== hooks.deps![index])) {
      hooks.cleanup?.();
      hooks.deps = deps;
      hooks.pending = effect;
    }
  },
}));
vi.mock("@/lib/fetch", () => ({ apiFetch: hooks.fetch }));

const initialQuery = { view: "articles", page: 1, search: "", sort: "name", direction: "asc", locale: "en" } as const;
const response = (id: string) => Response.json({
  calculationRunId: id,
  period: { from: "2026-10-01", to: "2026-10-31" },
});
function render(query: Parameters<typeof useSalesReport>[0] = initialQuery) {
  hooks.cursor = 0;
  const result = useSalesReport(query);
  if (hooks.pending) {
    hooks.cleanup = hooks.pending() || undefined;
    hooks.pending = undefined;
  }
  return result;
}
function request(index: number) {
  return new URL(hooks.fetch.mock.calls[index][0], "https://app.test").searchParams;
}

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  hooks.deps = undefined;
  hooks.cleanup = undefined;
  hooks.pending = undefined;
  hooks.fetch.mockReset();
});
afterEach(() => hooks.cleanup?.());

it("pins filtered views, sorting, pages and CSV to the same calculation", async () => {
  hooks.fetch.mockImplementation(async () => response("run-a"));
  render();
  await vi.waitFor(() => expect(render().data?.calculationRunId).toBe("run-a"));

  const filtered = { ...initialQuery, view: "brands" as const, page: 2, search: "A&B", sort: "revenue", direction: "desc" as const };
  const loading = render(filtered);
  expect(loading.busy).toBe(true);
  expect(loading.exportHref).toBeNull();
  await vi.waitFor(() => expect(render(filtered).busy).toBe(false));

  expect(Object.fromEntries(request(1))).toEqual({
    view: "brands", page: "2", q: "A&B", sort: "revenue", direction: "desc", calculationRunId: "run-a",
  });
  const csv = new URL(render(filtered).exportHref!, "https://app.test").searchParams;
  expect(Object.fromEntries(csv)).toEqual({
    view: "brands", calculationRunId: "run-a", q: "A&B", sort: "revenue", direction: "desc", format: "csv", locale: "en",
  });
});

it("validates the period and requests a fresh calculation when applying or refreshing", async () => {
  hooks.fetch.mockImplementation(async () => response("run-a"));
  const first = render();
  expect(first.applyPeriod()).toBe(false);
  expect(render().error).toBe("INVALID_REPORT_PERIOD");
  expect(hooks.fetch).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(render().data).not.toBeNull());

  render().setPeriod({ from: "2026-09-01", to: "2026-09-30" });
  expect(render().applyPeriod()).toBe(true);
  render();
  expect(request(1).get("calculationRunId")).toBeNull();
  expect(request(1).get("dateFrom")).toBe("2026-09-01");
  expect(request(1).get("dateTo")).toBe("2026-09-30");
  await vi.waitFor(() => expect(render().busy).toBe(false));

  render().refresh();
  render();
  expect(request(2).get("calculationRunId")).toBeNull();
  await vi.waitFor(() => expect(render().busy).toBe(false));
});

it.each(["success", "failure"])("ignores delayed %s from a cancelled request", async (outcome) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  hooks.fetch.mockImplementationOnce(async () => {
    await delayed;
    if (outcome === "failure") throw Error("Old error");
    return response("old");
  }).mockImplementation(async () => response("new"));
  render();
  const query = { ...initialQuery, page: 2 };
  render(query);
  await vi.waitFor(() => expect(render(query).data?.calculationRunId).toBe("new"));
  release();
  await delayed;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(render(query).data?.calculationRunId).toBe("new");
  expect(render(query).error).toBe("");
  expect(hooks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
