import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DateField } from "@/components/ui/date-field/date-field";
import { ReportPeriodControls } from "@/components/data-reporting/report-period-controls/report-period-controls";

vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useId: () => "period" }));
const copy = { reportPeriod: "Period", periodHelp: "Used for recalculation", dateFrom: "From", dateTo: "To" };
function props(error: string | null = null) {
  return { copy, dateFrom: "2026-11-01", dateTo: "2026-11-17", error, onDateFromChange: vi.fn(), onDateToChange: vi.fn() };
}
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}

it("preserves date bounds and routes each change to the correct endpoint", () => {
  const input = props();
  const fields = nodes(ReportPeriodControls(input)).filter(node => node.type === DateField).map(node => node.props);
  expect(fields[0].max).toBe(input.dateTo);
  expect(fields[1].min).toBe(input.dateFrom);
  fields[0].onChange({ target: { value: "2026-10-01" } });
  fields[1].onChange({ target: { value: "" } });
  expect(input.onDateFromChange).toHaveBeenCalledExactlyOnceWith("2026-10-01");
  expect(input.onDateToChange).toHaveBeenCalledExactlyOnceWith("");
});

it.each([null, "Invalid period"])("associates both fields with help and the current error: %s", error => {
  const html = renderToStaticMarkup(createElement(ReportPeriodControls, props(error)));
  const description = error ? "period-help period-error" : "period-help";
  expect(html.match(new RegExp(`aria-describedby="${description}"`, "g"))).toHaveLength(2);
  expect(html).toContain('id="period-help"');
  expect(html.includes('role="alert"')).toBe(Boolean(error));
  expect(html.match(new RegExp(`aria-invalid="${Boolean(error)}"`, "g"))).toHaveLength(2);
});

it("leaves date bounds unset when the opposite endpoint is blank", () => {
  const fields = nodes(ReportPeriodControls({ ...props(), dateFrom: "", dateTo: "" })).filter(node => node.type === DateField);
  expect(fields[0].props.max).toBeUndefined();
  expect(fields[1].props.min).toBeUndefined();
});
