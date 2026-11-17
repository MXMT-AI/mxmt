import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import DataReportingHub from "@/components/data-reporting/data-reporting-hub/data-reporting-hub";
import { Button } from "@/components/ui/button/button";

const fixture = vi.hoisted(() => ({ search: "", replaceState: vi.fn(), ready: [] as Promise<void>[] }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(fixture.search) }));
vi.mock("next/dynamic", async () => {
  const { createElement } = await import("react");
  return { default: (load: () => Promise<{ default: import("react").ComponentType<any> }>) => {
    let component: import("react").ComponentType<any> | undefined;
    fixture.ready.push(load().then(module => { component = module.default; }));
    return (props: Record<string, unknown>) => component ? createElement(component, props) : null;
  } };
});
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: "en" }) }));
vi.mock("@/components/merchandising/reporting-source-status/reporting-source-status", () => ({ default: () => null }));
vi.mock("@/components/data-reporting/data-reporting-workspace/data-reporting-workspace", () => ({
  default: () => "Sheets workspace",
}));
vi.mock("@/components/data-reporting/sales-reporting-workspace/sales-reporting-workspace", () => ({
  default: () => "SalesDrive workspace",
}));

const props = { userRole: "ADMIN", initialPreferences: {} };
beforeAll(async () => { await Promise.all(fixture.ready); });

beforeEach(() => {
  vi.resetAllMocks();
  fixture.search = "";
});
afterEach(() => vi.unstubAllGlobals());

function buttons(node: ReactNode): { children: string; onClick: () => void }[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  if (node.type === Button) return [node.props as { children: string; onClick: () => void }];
  return buttons(node.props.children);
}

it.each([
  { query: "?provider=salesdrive", expected: "SalesDrive workspace", absent: "Sheets workspace" },
  { query: "?provider=sheets", expected: "Sheets workspace", absent: "SalesDrive workspace" },
  { query: "?provider=unknown", expected: "Sheets workspace", absent: "SalesDrive workspace" },
  { query: "", expected: "Sheets workspace", absent: "SalesDrive workspace" },
])("renders the selected workspace immediately for $query", ({ query, expected, absent }) => {
  fixture.search = query;
  const html = renderToStaticMarkup(createElement(DataReportingHub, props));
  expect(html).toContain(expected);
  expect(html).not.toContain(absent);
});

it("replaces the provider while preserving the remaining URL and follows later URL changes", () => {
  const url = "https://app.test/en/data-reporting?provider=salesdrive&page=3#report";
  fixture.search = new URL(url).search;
  vi.stubGlobal("window", { location: { href: url }, history: { replaceState: fixture.replaceState } });

  const sheets = buttons(DataReportingHub(props)).find((button) => button.children === "Google Sheets");
  sheets!.onClick();
  const updated = fixture.replaceState.mock.calls[0][2] as URL;
  expect(updated.pathname).toBe("/en/data-reporting");
  expect(updated.searchParams.get("provider")).toBe("sheets");
  expect(updated.searchParams.get("page")).toBe("3");
  expect(updated.hash).toBe("#report");
  expect(fixture.replaceState.mock.calls[0].slice(0, 2)).toEqual([null, ""]);

  fixture.search = updated.search;
  expect(renderToStaticMarkup(createElement(DataReportingHub, props))).toContain("Sheets workspace");
  fixture.search = new URL(url).search;
  expect(renderToStaticMarkup(createElement(DataReportingHub, props))).toContain("SalesDrive workspace");
});
