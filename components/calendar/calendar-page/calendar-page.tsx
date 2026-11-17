import { requireWorkspaceTenantId } from "@/lib/workspace-request";
import { prisma } from "@/lib/prisma";
import MarketingCalendar from "@/components/calendar/marketing-calendar/marketing-calendar";
import { buildCalendarWeeks } from "../marketing-calendar/calendar-weeks";
import { getLocale } from "next-intl/server";

export default async function CalendarPage() {
  const tenantId = await requireWorkspaceTenantId();

  const [events, locale] = await Promise.all([
    prisma.marketingEvent.findMany({
      where: { tenantId },
      select: {
        id: true,
        weekKey: true,
        rowKey: true,
        type: true,
        label: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    getLocale(),
  ]);

  return <MarketingCalendar initialEvents={events} calendar={buildCalendarWeeks(new Date(), locale === "en" ? "en" : "uk")} />;
}
