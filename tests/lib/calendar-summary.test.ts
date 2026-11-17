import { expect, it } from "vitest";
import { CalendarSummary } from "@/components/calendar/calendar-summary/calendar-summary";
import { mapCalendarDemoData } from "@/components/calendar/marketing-calendar/calendar-demo-data";
import type { InsightItem } from "@/components/calendar/marketing-calendar/calendar-types";

const tip: InsightItem = { type: "agent", brand: "Demo", week: "Week 1", title: "Tip", desc: "Details", impact: "Impact" };
type Metric = { props: { value: string; label: string } };

it.each(["uk", "en"] as const)("counts tips and warnings separately from stock insights in %s", locale => {
  const summary = CalendarSummary({ eventCount: 7, insights: [tip, tip, { ...tip, type: "warn" }, { ...tip, type: "stock" }], locale });
  const metrics = summary.props.children as Metric[];
  expect(metrics.map(metric => metric.props.value)).toEqual(["7", "2", "1"]);
  expect(metrics.map(metric => metric.props.label)).toEqual(locale === "uk" ? ["Подій у плані", "Порад агента", "Попереджень"] : ["Events in plan", "Agent tips", "Warnings"]);
});

it("preserves zero metrics for empty data", () => {
  const metrics = CalendarSummary({ eventCount: 0, insights: [], locale: "en" }).props.children as Metric[];
  expect(metrics.map(metric => metric.props.value)).toEqual(["0", "0", "0"]);
});

it("counts the mapped demo events rather than assuming a fixed template size", () => {
  expect(mapCalendarDemoData([]).demoEventCount).toBe(0);
  const oneWeek = mapCalendarDemoData([{ k: "w47", l: "Week 47", d: "16–22", m: "Nov" }]);
  expect(oneWeek.demoEventCount).toBe(1);
  expect(oneWeek.demoEvents.accent.w47).toEqual([{ t: "promo", l: "Outlet" }]);
  const twoWeeks = mapCalendarDemoData([
    { k: "w47", l: "Week 47", d: "16–22", m: "Nov" },
    { k: "w48", l: "Week 48", d: "23–29", m: "Nov" },
  ]);
  expect(twoWeeks.demoEventCount).toBeGreaterThan(oneWeek.demoEventCount);
});
