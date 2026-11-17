import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import type { Locale } from "@/i18n/routing";
import type { Week } from "../marketing-calendar/calendar-types";

const buttonClassName = "flex items-center gap-1 border-0 p-0 font-sans text-xs hover:bg-transparent disabled:opacity-30";

export function CalendarWeekNavigation({ weeks, start, visibleCount, locale, onChange }: {
  weeks: Week[];
  start: number;
  visibleCount: number;
  locale: Locale;
  onChange: (start: number) => void;
}) {
  const uk = locale === "uk";
  const lastStart = Math.max(0, weeks.length - visibleCount);
  const currentStart = Math.min(lastStart, Math.max(0, start));
  const first = weeks[currentStart];
  const last = weeks[Math.min(weeks.length - 1, currentStart + visibleCount - 1)];

  return (
    <nav aria-label={uk ? "Тижні календаря" : "Calendar weeks"} className="flex items-center justify-between mb-2">
      <Button onClick={() => onChange(Math.max(0, currentStart - 1))} disabled={currentStart === 0} className={buttonClassName}>
        <ChevronLeft size={14} aria-hidden="true" /> {uk ? "← Раніше" : "← Earlier"}
      </Button>
      <span className="text-[10px] font-mono text-(--subtle)">
        {first && last ? `${first.d} — ${last.d}` : ""}
      </span>
      <Button onClick={() => onChange(Math.min(lastStart, currentStart + 1))} disabled={currentStart === lastStart} className={buttonClassName}>
        {uk ? "Пізніше →" : "Later →"} <ChevronRight size={14} aria-hidden="true" />
      </Button>
    </nav>
  );
}
