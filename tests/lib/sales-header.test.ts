import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SalesHeader } from "@/components/sales/sales-header/sales-header";
import { Button } from "@/components/ui/button/button";
import { salesCopy } from "@/lib/sales-copy";
const period = { from: "2026-10-01", to: "2026-10-31" };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each([
  ["en", "en-GB", "2026-01-15T22:30:00Z", "00:30"],
  ["uk", "uk-UA", "2026-01-15T22:30:00Z", "00:30"],
  ["en", "en-GB", "2026-07-15T21:30:00Z", "00:30"],
  ["uk", "uk-UA", "2026-07-15T21:30:00Z", "00:30"],
] as const)("renders %s snapshot time with Kyiv timezone (%s, %s)", (lang, locale, createdAt, expectedTime) => {
  const copy = salesCopy[lang];
  const html = renderToStaticMarkup(createElement(SalesHeader, { period, createdAt, copy, locale }));
  expect(html).toContain(copy.title);
  expect(html).toContain(`${copy.scope}: ${period.from} — ${period.to}`);
  expect(html).toContain(copy.snapshot);
  expect(html).toContain(expectedTime);
  expect(html).toContain("16");
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(html).not.toContain("<button");
});
it("shows an optional refresh action and calls its handler", () => {
  const onRefresh = vi.fn();
  const props = { period, createdAt: "2026-11-15T12:00:00Z", copy: salesCopy.en, locale: "en-GB", onRefresh };
  const action = nodes(SalesHeader(props).props.action).find(node => node.type === Button)!.props;
  expect(action.children).toBe(salesCopy.en.refresh);
  action.onClick();
  expect(onRefresh).toHaveBeenCalledOnce();
  expect(SalesHeader({ ...props, onRefresh: undefined }).props.action).toBeUndefined();
});
