import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button/button";
import { CalendarWeekNavigation } from "@/components/calendar/calendar-week-navigation/calendar-week-navigation";

const weeks = Array.from({ length: 13 }, (_, index) => ({ k: `w${index}`, l: `Week ${index}`, m: "Nov", d: `Range ${index}` }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}

it.each([
  { start: 0, previous: true, next: false, previousPage: 0, nextPage: 1 },
  { start: 3, previous: false, next: false, previousPage: 2, nextPage: 4 },
  { start: 9, previous: false, next: true, previousPage: 8, nextPage: 9 },
])("keeps navigation within the visible window at $start", ({ start, previous, next, previousPage, nextPage }) => {
  const onChange = vi.fn();
  const tree = nodes(CalendarWeekNavigation({ weeks, start, visibleCount: 4, locale: "en", onChange }));
  const buttons = tree.filter(node => node.type === Button);
  expect(buttons.map(node => node.props.disabled)).toEqual([previous, next]);
  buttons[0].props.onClick(); buttons[1].props.onClick();
  expect(onChange.mock.calls).toEqual([[previousPage], [nextPage]]);
  expect(tree.find(node => node.type === "span")!.props.children).toBe(`Range ${start} — Range ${start + 3}`);
});

it.each([0, 2, 4])("disables both directions for %s weeks without producing negative positions", count => {
  const onChange = vi.fn();
  const tree = nodes(CalendarWeekNavigation({ weeks: weeks.slice(0, count), start: 0, visibleCount: 4, locale: "uk", onChange }));
  const buttons = tree.filter(node => node.type === Button);
  expect(tree[0].props["aria-label"]).toBe("Тижні календаря");
  expect(buttons.every(node => node.props.disabled)).toBe(true);
  for (const button of buttons) button.props.onClick();
  expect(onChange.mock.calls).toEqual([[0], [0]]);
  expect(tree.find(node => node.type === "span")!.props.children).toBe(count ? `Range 0 — Range ${count - 1}` : "");
});
