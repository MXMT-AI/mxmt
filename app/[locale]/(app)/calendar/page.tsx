import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import MarketingCalendar from "@/components/calendar/MarketingCalendar";

export default async function CalendarPage() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const events = await prisma.marketingEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  return <MarketingCalendar initialEvents={events} />;
}
