import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button/button";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar/calendar-toolbar";

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function start(overrides: Partial<Parameters<typeof CalendarToolbar>[0]> = {}) {
  const props: Parameters<typeof CalendarToolbar>[0] = {
    locale: "en", tab: "agent", showDemo: false, aiLoading: false, hasAiPlan: false,
    onTabChange: vi.fn(), onToggleDemo: vi.fn(), onGenerate: vi.fn(), onAdd: vi.fn(), ...overrides,
  };
  const buttons = nodes(CalendarToolbar(props)).filter(node => node.type === Button).map(node => node.props);
  return { props, buttons };
}

it.each(["uk", "en"] as const)("preserves tab selection and action callbacks in %s", locale => {
  const { props, buttons } = start({ locale });
  const tabs = buttons.slice(2, 5);
  expect(tabs.map(button => button["aria-pressed"])).toEqual([false, true, false]);
  for (const tab of tabs) tab.onClick();
  expect(vi.mocked(props.onTabChange).mock.calls).toEqual([["plan"], ["agent"], ["stock"]]);
  buttons[0].onClick(); buttons[1].onClick(); buttons[5].onClick();
  expect(props.onGenerate).toHaveBeenCalledOnce();
  expect(props.onToggleDemo).toHaveBeenCalledOnce();
  expect(props.onAdd).toHaveBeenCalledOnce();
  expect(buttons[5].children).toBe(locale === "uk" ? "+ Додати подію" : "+ Add event");
});

it.each([false, true])("keeps AI availability and the demo toggle state (%s)", busy => {
  const { buttons } = start({ aiLoading: busy, showDemo: true, hasAiPlan: true });
  expect(buttons[0].disabled).toBe(busy);
  expect(buttons[0].children[1]).toBe(busy ? "Generating…" : "AI plan ✓");
  expect(buttons[1]["aria-pressed"]).toBe(true);
  expect(buttons[1].title).toBe("Hide demo template");
});
