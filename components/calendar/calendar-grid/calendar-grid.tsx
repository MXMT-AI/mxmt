import { Button } from "@/components/ui/button/button";
import type { Locale } from "@/i18n/routing";
import { CalendarChip } from "../calendar-chip/calendar-chip";
import { calendarRows } from "../marketing-calendar/calendar-rows";
import type { Chip, EventLocation, Week } from "../marketing-calendar/calendar-types";

export function CalendarGrid({ weeks, locale, getChips, onAdd, onEdit, onDelete }: {
  weeks: Week[];
  locale: Locale;
  getChips: (rowKey: string, weekKey: string) => Chip[];
  onAdd: (location: EventLocation) => void;
  onEdit: (chip: Chip & { id: string }, location: EventLocation) => void;
  onDelete: (id: string) => void;
}) {
  const uk = locale === "uk";
  return (
    <div className="overflow-x-auto rounded-xl border border-(--border) mb-5">
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-40" />
          {weeks.map((_, i) => <col key={i} />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="bg-(--surface2) text-(--muted) font-medium p-3 text-left border-b border-r border-(--border) sticky left-0 z-10 text-sm">
              {uk ? "Канал" : "Channel"}
            </th>
            {weeks.map((w) => (
              <th scope="col" key={w.k} className="bg-(--surface2) text-(--muted) font-medium p-2 text-center border-b border-r border-(--border)">
                <div className="text-sm font-bold text-(--text)">{w.m}</div>
                <div className="text-xs text-(--subtle) mt-0.5">{w.l}</div>
                <div className="text-[11px] text-(--subtle)">{w.d}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendarRows.map((row, ri) => {
            if (row.t === "g") {
              return (
                <tr key={ri}>
                  <td colSpan={weeks.length + 1}
                    className="bg-(--surface) text-xs font-bold text-(--subtle) uppercase tracking-wider p-2 pl-4 border-b border-(--border-faint)">
                    {row.l}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={ri} className="hover:bg-(--input-bg)">
                <th scope="row" className="text-left p-2 pl-4 text-(--muted) font-medium border-b border-r border-(--border-faint) bg-(--row) sticky left-0 z-10 text-xs">
                  {row.l}
                </th>
                {weeks.map((w) => {
                  const location = { rowKey: row.k, weekKey: w.k };
                  const chips = getChips(row.k, w.k);
                  return (
                    <td key={w.k} className="p-1.5 border-b border-r border-(--border-faint) align-top bg-(--bg)">
                      {chips.map((chip, index) => (
                        <CalendarChip
                          key={chip.id ?? index}
                          chip={chip}
                          editLabel={uk ? "Редагувати подію" : "Edit event"}
                          deleteLabel={uk ? "Видалити подію" : "Delete event"}
                          onEdit={(event) => onEdit(event, location)}
                          onDelete={onDelete}
                        />
                      ))}
                      <Button
                        onClick={() => onAdd(location)}
                        aria-label={uk ? `Додати подію · ${row.l} · ${w.d}` : `Add event · ${row.l} · ${w.d}`}
                        className="mt-0.5 w-full border-0 p-0 text-left font-sans text-xs text-(--subtle) hover:bg-transparent hover:text-(--text)"
                      >
                        +
                      </Button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
