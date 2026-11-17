import { expect, it } from "vitest";
import { createCalendarChipLookup } from "@/components/calendar/marketing-calendar/calendar-chips";

type Input = Parameters<typeof createCalendarChipLookup>[0];
const input: Input = {
  dbEvents: [
    { id: "1", rowKey: "events", weekKey: "w47", type: "sale", label: "First" },
    { id: "2", rowKey: "events", weekKey: "w47", type: "event", label: "Second" },
    { id: "3", rowKey: "events", weekKey: "w48", type: "event", label: "Later" },
  ],
  aiChips: [{ rowKey: "events", weekKey: "w47", type: "promo", label: "AI" }],
  insights: [{ rowKey: "events", weekKey: "w47", type: "warn", brand: "Very long brand name here", week: "Week 47", title: "Review", desc: "Details", impact: "Impact" }],
  holidayChips: { w47: [{ t: "holiday", l: "Holiday" }] },
  demoEvents: { events: { w47: [{ t: "event", l: "Demo" }] } },
  demoAgentInsights: { w47_events: [{ t: "agent", l: "Demo agent" }] },
  showDemo: true,
  agentMode: true,
};

it("preserves holiday, demo, user and AI order, IDs and separate week locations", () => {
  const get = createCalendarChipLookup(input);
  expect(get("events", "w47")).toEqual([
    { t: "holiday", l: "Holiday" }, { t: "event", l: "Demo" },
    { t: "sale", l: "First", id: "1" }, { t: "event", l: "Second", id: "2" }, { t: "promo", l: "AI" },
  ]);
  expect(get("events", "w48")).toEqual([{ t: "event", l: "Later", id: "3" }]);
  expect(get("other", "w47")).toEqual([]);
});

it("uses live insights when the cell has no AI plan and truncates only long brand names", () => {
  const get = createCalendarChipLookup({ ...input, aiChips: [] });
  expect(get("events", "w47").at(-1)).toEqual({ t: "warn", l: input.insights[0].brand.slice(0, 16) + "…" });
  const short = createCalendarChipLookup({ ...input, aiChips: [], insights: [{ ...input.insights[0], brand: "Short" }] });
  expect(short("events", "w47").at(-1)).toEqual({ t: "warn", l: "Short" });
});

it("uses demo agent tips only when enabled and no live source matches the cell", () => {
  const get = createCalendarChipLookup({ ...input, aiChips: [], insights: [] });
  expect(get("events", "w47").at(-1)).toEqual({ t: "agent", l: "Demo agent" });
  const hidden = createCalendarChipLookup({ ...input, aiChips: [], insights: [], showDemo: false });
  expect(hidden("events", "w47").map(chip => chip.l)).toEqual(["Holiday", "First", "Second"]);
});

it("excludes agent sources outside the agent tab, leaving user events and holidays intact", () => {
  const get = createCalendarChipLookup({ ...input, agentMode: false, showDemo: false });
  expect(get("events", "w47").map(chip => chip.l)).toEqual(["Holiday", "First", "Second"]);
});

it("ignores insights without a cell location and returns independent arrays without mutating sources", () => {
  const snapshot = structuredClone(input);
  const get = createCalendarChipLookup({ ...input, aiChips: [], insights: [{ ...input.insights[0], rowKey: undefined }] });
  expect(get("events", "w47").at(-1)?.l).toBe("Demo agent");
  get("events", "w47").pop();
  expect(get("events", "w47").at(-1)?.l).toBe("Demo agent");
  expect(input).toEqual(snapshot);
});
