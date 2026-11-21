import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MerchandisingFiltersForm } from "@/components/merchandising/merchandising-filters-form/merchandising-filters-form";
import { readMerchandisingFilters } from "@/lib/merchandising-navigation";
import { apiFetch } from "@/lib/fetch";
import { Button } from "@/components/ui/button/button";

const state = vi.hoisted(() => ({
  values: [] as any[], index: 0, pending: false, refIndex: 0,
  publicationRequest: { current: null as AbortController | null },
  push: vi.fn(), refresh: vi.fn(), focus: vi.fn(),
  query: "period=custom&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=external&snapshotId=pinned&brandId=brand-a&page=8",
}));
vi.mock("react", async load => ({
  ...await load<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (next: any) => { state.values[index] = typeof next === "function" ? next(state.values[index]) : next; }];
  },
  useTransition: () => [state.pending, (callback: () => void) => callback()],
  useEffect: vi.fn(),
  useRef: () => state.refIndex++ === 0 ? state.publicationRequest : { current: { focus: state.focus } },
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, usePathname: () => "/stock", useRouter: () => ({ push: state.push, refresh: state.refresh }) }));
vi.mock("@/lib/fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: "uk" }) }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const onApply = vi.fn();
function render(publishAllowed = false) {
  state.index = 0;
  state.refIndex = 0;
  return nodes(MerchandisingFiltersForm({
    filters: readMerchandisingFilters(new URLSearchParams(state.query)),
    options: { monobrand: false, channels: [{ id: "1" }], truncated: false }, onApply, publishAllowed,
  }));
}
function change(name: string, value: string) {
  render().find(node => node.props.name === name)!.props.onChange({ target: { value } });
}
function submit() { render().find(node => node.type === "form")!.props.onSubmit({ preventDefault: vi.fn() }); }
beforeEach(() => {
  state.values = []; state.pending = false;
  state.publicationRequest.current = null;
  vi.clearAllMocks();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; });
});
afterEach(() => vi.unstubAllGlobals());

it("applies custom dates, keeps channel and detail filters, and invalidates the previous snapshot", () => {
  expect(render().some(node => node.type === "option" && node.props.value === "external")).toBe(true);
  change("dateFrom", "2026-08-01");
  change("dateTo", "2026-08-31");
  submit();
  const [href, options] = state.push.mock.calls[0];
  const url = new URL(href, "https://example.test");
  expect(url.pathname).toBe("/stock");
  expect(Object.fromEntries(url.searchParams)).toEqual({ period: "custom", dateFrom: "2026-08-01", dateTo: "2026-08-31", channelId: "external", brandId: "brand-a" });
  expect(options).toEqual({ scroll: false });
  expect(onApply).toHaveBeenCalledOnce();
});

it("keeps a pinned snapshot when dates are unchanged and resets pagination", () => {
  change("channelId", "1");
  submit();
  const params = new URL(state.push.mock.calls[0][0], "https://example.test").searchParams;
  expect(params.get("snapshotId")).toBe("pinned");
  expect(params.get("channelId")).toBe("1");
  expect(params.has("page")).toBe(false);
});

it("switches to a preset using the anchor date", () => {
  change("period", "month");
  expect(render().some(node => node.props.name === "dateTo")).toBe(false);
  change("periodAnchor", "2026-08-15");
  submit();
  const params = new URL(state.push.mock.calls[0][0], "https://example.test").searchParams;
  expect(params.get("dateFrom")).toBe("2026-08-01");
  expect(params.get("dateTo")).toBe("2026-08-31");
});

it("focuses the validation error and does not navigate for an inverted date range", () => {
  change("dateFrom", "2026-10-01");
  submit();
  expect(state.push).not.toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();
  expect(state.focus).toHaveBeenCalledOnce();
  expect(render().some(node => node.props.role === "alert" && node.props.tabIndex === -1)).toBe(true);
});

it("disables apply while navigation is pending", () => {
  state.pending = true;
  const tree = render();
  expect(tree.find(node => node.type === "form")!.props["aria-busy"]).toBe(true);
  expect(tree.find(node => node.type === Button)!.props.disabled).toBe(true);
});

it("publishes the selected dates without navigating when the refresh fails", async () => {
  change("dateTo", "2026-09-29");
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ code: "PUBLISHED_DATE_INCOMPLETE" }, { status: 409 }));
  const form = render(true).find(node => node.type === "form")!;
  form.props.onSubmit({
    preventDefault: vi.fn(),
    nativeEvent: { submitter: { getAttribute: () => "publishSnapshot" } },
  });
  await vi.waitFor(() => expect(state.publicationRequest.current).toBeNull());
  const [path, init] = vi.mocked(apiFetch).mock.calls[0];
  expect(path).toBe("/api/merchandising/snapshots");
  expect(JSON.parse(init!.body as string)).toEqual({
    publish: true, dateFrom: "2026-09-01", dateTo: "2026-09-29",
  });
  expect(state.push).not.toHaveBeenCalled();
  expect(render(true).some(node => node.props.role === "alert")).toBe(true);
});
