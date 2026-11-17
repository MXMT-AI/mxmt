import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CalendarPage from "@/components/calendar/calendar-page/calendar-page";
import MarketingCalendar from "@/components/calendar/marketing-calendar/marketing-calendar";
import { buildCalendarWeeks } from "@/components/calendar/marketing-calendar/calendar-weeks";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), locale: vi.fn(), redirect: vi.fn(), events: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next-intl/server", () => ({ getLocale: mocks.locale }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/prisma", () => ({ prisma: { marketingEvent: { findMany: mocks.events } } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-tenant-id": "demo" }));
  mocks.locale.mockResolvedValue("uk");
  mocks.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  mocks.events.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

it.each(["uk", "en"])("redirects missing tenant context before reading events in %s", async locale => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.locale.mockResolvedValue(locale);
  await expect(CalendarPage()).rejects.toThrow("REDIRECT");
  expect(mocks.redirect).toHaveBeenCalledWith({ href: "/login", locale });
  expect(mocks.events).not.toHaveBeenCalled();
});

it.each([
  { events: [] },
  { events: [{ id: "event", weekKey: "w47", rowKey: "accent", type: "promo", label: "Launch" }] },
])("passes tenant-scoped events to the calendar (%j)", async ({ events }) => {
  mocks.events.mockResolvedValue(events);
  const element = await CalendarPage();
  expect(mocks.events).toHaveBeenCalledExactlyOnceWith({
    where: { tenantId: "demo" },
    select: { id: true, weekKey: true, rowKey: true, type: true, label: true },
    orderBy: { createdAt: "asc" },
  });
  expect(element.type).toBe(MarketingCalendar);
  expect(element.props.initialEvents).toBe(events);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it("builds the schedule for each request instead of keeping the module import date", async () => {
  vi.useFakeTimers();
  const firstDate = new Date(2026, 10, 16, 12);
  vi.setSystemTime(firstDate);
  const first = (await CalendarPage()).props.calendar;
  expect(first).toEqual(buildCalendarWeeks(firstDate));
  const nextDate = new Date(2026, 10, 23, 12);
  vi.setSystemTime(nextDate);
  const next = (await CalendarPage()).props.calendar;
  expect(next).toEqual(buildCalendarWeeks(nextDate));
  expect(next.weeks[0].k).not.toBe(first.weeks[0].k);
  expect(JSON.parse(JSON.stringify(next))).toEqual(next);
});

it("passes English week labels when the page locale is English", async () => {
  mocks.locale.mockResolvedValue("en");
  const calendar = (await CalendarPage()).props.calendar;
  expect(calendar.weeks[0].l).toMatch(/^Week /);
});
