import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ReportTableState } from "@/components/data-reporting/report-table-state/report-table-state";

it("announces loading without exposing a retry action", () => {
  const html = renderToStaticMarkup(createElement(ReportTableState, { state: "loading", message: "Loading rows" }));
  expect(html).toContain('role="status"');
  expect(html).toContain("Loading rows");
  expect(html).not.toContain("<button");
});

it.each(["No matching rows", "Choose at least one column"])("renders the empty-state message %s", message => {
  const html = renderToStaticMarkup(createElement(ReportTableState, { state: "empty", message }));
  expect(html).toContain(message);
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain("<button");
});

it("announces errors safely and preserves the retry callback", () => {
  const onRetry = vi.fn();
  const props = { state: "error" as const, message: "<script>Failure</script>", retryLabel: "Try again", onRetry };
  const html = renderToStaticMarkup(createElement(ReportTableState, props));
  expect(html).toContain('role="alert"');
  expect(html).toContain("&lt;script&gt;Failure&lt;/script&gt;");
  expect(html).toContain("Try again");
  const children = ReportTableState(props).props.children.props.children;
  children[2].props.onClick();
  expect(onRetry).toHaveBeenCalledOnce();
});
