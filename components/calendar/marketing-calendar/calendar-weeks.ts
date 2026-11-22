import type { CalendarSchedule, Chip, Week } from "./calendar-types";
import type { Locale } from "@/i18n/routing";
import { calendarMarketingCalendarCalendarWeeksMessages as englishCopy } from "@/messages/en.json";
import { calendarMarketingCalendarCalendarWeeksMessages as ukrainianCopy } from "@/messages/uk.json";

const months = {
  uk: [ukrainianCopy.ukСіч,ukrainianCopy.ukЛют,ukrainianCopy.ukБер,ukrainianCopy.ukКві,ukrainianCopy.ukТра,ukrainianCopy.ukЧер,ukrainianCopy.ukЛип,ukrainianCopy.ukСер,ukrainianCopy.ukВер,ukrainianCopy.ukЖов,ukrainianCopy.ukЛис,ukrainianCopy.ukГру],
  en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
};

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function generateWeeks(count: number, today: Date, locale: Locale): Week[] {
  const weeks: Week[] = [];
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const start = new Date(monday);
    start.setDate(monday.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const isoWeek = getISOWeek(start);
    const fmt = (d: Date) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    weeks.push({
      k: `w${isoWeek}`,
      l: `${locale === "uk" ? ukrainianCopy.lWeek : englishCopy.lWeek} ${isoWeek}`,
      d: `${fmt(start)}–${fmt(end)}`,
      m: months[locale][start.getMonth()],
    });
  }
  return weeks;
}

const UA_HOLIDAYS_LIST = [
  { month: 2,  day: 14, label: ukrainianCopy.label1402ДеньВалентина },
  { month: 3,  day: 8,  label: ukrainianCopy.label0803ЖіночийДень },
  { month: 5,  day: 1,  label: ukrainianCopy.label0105ДеньПраці },
  { month: 5,  day: 9,  label: ukrainianCopy.label0905ДеньПамЯті },
  { month: 5,  day: 15, label: ukrainianCopy.label1505ДеньВишиванки },
  { month: 6,  day: 1,  label: ukrainianCopy.label0106ДеньДітей },
  { month: 6,  day: 28, label: ukrainianCopy.label2806ДеньКонституції },
  { month: 7,  day: 28, label: ukrainianCopy.label2807ДеньДержавності },
  { month: 8,  day: 24, label: ukrainianCopy.label2408ДеньНезалежності },
  { month: 9,  day: 1,  label: ukrainianCopy.label0109ДеньЗнань },
  { month: 10, day: 14, label: ukrainianCopy.label1410ДеньЗахисника },
  { month: 12, day: 19, label: ukrainianCopy.label1912Миколай },
  { month: 12, day: 25, label: ukrainianCopy.label2512Різдво },
];

function buildHolidayChips(weeks: Week[], year: number): Record<string, Chip[]> {
  const chips: Record<string, Chip[]> = {};
  for (const h of UA_HOLIDAYS_LIST) {
    const w = getISOWeek(new Date(year, h.month - 1, h.day));
    const weekKey = `w${w}`;
    if (weeks.some((wk) => wk.k === weekKey)) {
      if (!chips[weekKey]) chips[weekKey] = [];
      chips[weekKey].push({ t: "holiday", l: h.label });
    }
  }
  return chips;
}

export function buildCalendarWeeks(today: Date, locale: Locale = "uk"): CalendarSchedule {
  const weeks = generateWeeks(13, today, locale);
  return { weeks, holidayChips: buildHolidayChips(weeks, today.getFullYear()) };
}
