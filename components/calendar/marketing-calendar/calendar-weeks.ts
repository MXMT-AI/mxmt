import type { Chip, Week } from "./calendar-types";

const MONTHS_UK = ["Січ","Лют","Бер","Кві","Тра","Чер","Лип","Сер","Вер","Жов","Лис","Гру"];

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function generateWeeks(count: number, today: Date): Week[] {
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
      l: `Тижд ${isoWeek}`,
      d: `${fmt(start)}–${fmt(end)}`,
      m: MONTHS_UK[start.getMonth()],
    });
  }
  return weeks;
}

const UA_HOLIDAYS_LIST = [
  { month: 2,  day: 14, label: "14.02 День Валентина 💌" },
  { month: 3,  day: 8,  label: "08.03 Жіночий день 🌸" },
  { month: 5,  day: 1,  label: "01.05 День праці" },
  { month: 5,  day: 9,  label: "09.05 День пам'яті" },
  { month: 5,  day: 15, label: "15.05 День вишиванки 🇺🇦" },
  { month: 6,  day: 1,  label: "01.06 День дітей 🎈" },
  { month: 6,  day: 28, label: "28.06 День Конституції" },
  { month: 7,  day: 28, label: "28.07 День Державності 🇺🇦" },
  { month: 8,  day: 24, label: "24.08 День Незалежності 🇺🇦" },
  { month: 9,  day: 1,  label: "01.09 День знань 📚" },
  { month: 10, day: 14, label: "14.10 День захисника ⚔️" },
  { month: 12, day: 19, label: "19.12 Миколай 🎅" },
  { month: 12, day: 25, label: "25.12 Різдво 🎄" },
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

export function buildCalendarWeeks(today: Date) {
  const weeks = generateWeeks(13, today);
  return { weeks, holidayChips: buildHolidayChips(weeks, today.getFullYear()) };
}
