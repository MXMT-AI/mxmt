import { expect, it } from "vitest";
import { buildCalendarWeeks } from "@/components/calendar/marketing-calendar/calendar-weeks";

it.each(["uk", "en"] as const)("localizes labels without changing the thirteen-week period in %s", locale => {
  const date = new Date(2026, 10, 16, 12);
  const schedule = buildCalendarWeeks(date, locale);
  expect(schedule.weeks).toHaveLength(13);
  expect(schedule.weeks[0]).toEqual({ k: "w47", l: locale === "uk" ? "Тижд 47" : "Week 47", d: "16.11–22.11", m: locale === "uk" ? "Лис" : "Nov" });
  expect(date.getDate()).toBe(16);
  expect(date.getHours()).toBe(12);
});

it("keeps event keys, date ranges and holiday placement identical across locales", () => {
  const date = new Date(2026, 10, 22, 12);
  const uk = buildCalendarWeeks(date, "uk");
  const en = buildCalendarWeeks(date, "en");
  expect(en.weeks.map(({ k, d }) => ({ k, d }))).toEqual(uk.weeks.map(({ k, d }) => ({ k, d })));
  expect(en.holidayChips).toEqual(uk.holidayChips);
  expect(en.weeks[0].d).toBe("16.11–22.11");
});
