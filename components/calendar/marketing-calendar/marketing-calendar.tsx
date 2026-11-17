"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/components/language-provider/language-provider";
import { Heading } from "@/components/ui/heading/heading";
import { Note } from "@/components/ui/note/note";
import { CalendarSummary } from "../calendar-summary/calendar-summary";
import { CalendarEventDialog } from "../calendar-event-dialog/calendar-event-dialog";
import { CalendarToolbar } from "../calendar-toolbar/calendar-toolbar";
import { CalendarWeekNavigation } from "../calendar-week-navigation/calendar-week-navigation";
import { CalendarGrid } from "../calendar-grid/calendar-grid";
import { CalendarInsightsPanel, CalendarStockPanel } from "../calendar-panels/calendar-panels";
import { calendarChipTypes } from "./calendar-chip-types";
import { mapCalendarDemoData } from "./calendar-demo-data";
import type { CalendarSchedule, CalendarTab, DbEvent, EventDialogState } from "./calendar-types";
import { createCalendarChipLookup } from "./calendar-chips";
import { useCalendarData } from "./use-calendar-data";
import { useCalendarEvents } from "./use-calendar-events";
import { useCalendarAiPlan } from "./use-calendar-ai-plan";

const visibleWeekCount = 4;

export default function MarketingCalendar({ initialEvents, calendar }: { initialEvents: DbEvent[]; calendar: CalendarSchedule }) {
  const { weeks, holidayChips } = calendar;
  const { demoEvents, demoAgentInsights, demoEventCount } = useMemo(() => mapCalendarDemoData(weeks), [weeks]);
  const { lang } = useLang();
  const [tab, setTab] = useState<CalendarTab>("plan");
  const [scrollStart, setScrollStart] = useState(0);
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);
  const { dbEvents, deleteError, saveEvent, deleteEvent } = useCalendarEvents(initialEvents);
  const { stockData, insights } = useCalendarData();
  const { aiChips, aiLoading, aiError, generate } = useCalendarAiPlan();
  const [showDemo, setShowDemo] = useState(false);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [showAllStock, setShowAllStock] = useState(false);

  const visibleWeeks = weeks.slice(scrollStart, scrollStart + visibleWeekCount);

  const getChips = useMemo(() => createCalendarChipLookup({
    dbEvents, aiChips, insights, holidayChips, demoEvents, demoAgentInsights,
    showDemo, agentMode: tab === "agent",
  }), [dbEvents, aiChips, insights, holidayChips, demoEvents, demoAgentInsights, showDemo, tab]);

  const generateAiPlan = async () => {
    if (await generate()) setTab("agent");
  };

  const locale = lang === "uk" ? "uk" : "en";
  const labels = {
    agent_analysis:   lang === "uk" ? "Детальний аналіз агента" : "Detailed agent analysis",
    agent_insights_h: lang === "uk" ? "Інсайти агента"   : "Agent insights",
    stock_title:      lang === "uk" ? "Статус залишків (реальні дані)" : "Stock status (live data)",
  };

  return (
    <div className="p-6 max-w-full overflow-hidden">
      <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-(--subtle) mb-1">
            {lang === "uk" ? "Маркетинговий планер" : "Marketing Planner"}
          </div>
          <Heading as="h1" variant="page" className="text-xl tracking-normal">
            {lang === "uk" ? "Календар активностей" : "Activity Calendar"}
          </Heading>
          <Note className="mt-0.5 font-mono leading-4">
            {weeks[0] && weeks[weeks.length - 1]
              ? `${weeks[0].d.split("–")[0]} — ${weeks[weeks.length - 1].d.split("–")[1]}`
              : ""}
            {" · "}
            {lang === "uk" ? "Реальні дані" : "Live data"}
          </Note>
        </div>

        <CalendarToolbar
          locale={locale}
          tab={tab}
          onTabChange={setTab}
          showDemo={showDemo}
          onToggleDemo={() => setShowDemo(value => !value)}
          aiLoading={aiLoading}
          hasAiPlan={aiChips.length > 0}
          onGenerate={generateAiPlan}
          onAdd={() => setEventDialog({ mode: "add", rowKey: "accent", weekKey: visibleWeeks[0]?.k ?? weeks[0]?.k ?? "w1" })}
        />
      </div>

      <CalendarSummary eventCount={dbEvents.length + (showDemo ? demoEventCount : 0)} insights={insights} locale={locale} />

      <div className="flex gap-3 mb-3 flex-wrap">
        {Object.entries(calendarChipTypes).map(([key, chip]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`size-2.5 rounded-xs border border-(--border) ${chip.fill}`} />
            <span className="text-[10px] text-(--muted)">{chip.legend[locale]}</span>
          </div>
        ))}
      </div>

      <CalendarWeekNavigation
        weeks={weeks}
        start={scrollStart}
        visibleCount={visibleWeekCount}
        locale={locale}
        onChange={setScrollStart}
      />

      {aiError && <Note role="alert" className="mb-2 text-sm leading-5 text-accent-danger">{lang === "uk" ? "Не вдалося згенерувати AI-план. Спробуйте ще раз." : "Could not generate the AI plan. Please try again."}</Note>}
      {deleteError && <Note role="alert" className="mb-2 text-sm leading-5 text-accent-danger">{lang === "uk" ? "Не вдалося видалити подію." : "Could not delete the event."}</Note>}
      <CalendarGrid
        weeks={visibleWeeks}
        locale={locale}
        getChips={getChips}
        onAdd={(location) => setEventDialog({ mode: "add", ...location })}
        onEdit={(chip, location) => setEventDialog({ mode: "edit", id: chip.id, type: chip.t, label: chip.l, ...location })}
        onDelete={deleteEvent}
      />

      <div className={`grid gap-4 ${tab === "plan" ? "grid-cols-2" : "grid-cols-1"}`}>
        {(tab === "plan" || tab === "agent") && (
          <CalendarInsightsPanel
            title={tab === "agent" ? labels.agent_analysis : labels.agent_insights_h}
            items={insights}
            locale={locale}
            expanded={showAllInsights}
            onToggle={() => setShowAllInsights((value) => !value)}
          />
        )}
        {(tab === "plan" || tab === "stock") && (
          <CalendarStockPanel
            title={labels.stock_title}
            items={stockData}
            locale={locale}
            expanded={showAllStock}
            onToggle={() => setShowAllStock((value) => !value)}
          />
        )}
      </div>

      {eventDialog && (
        <CalendarEventDialog
          event={eventDialog}
          weeks={weeks}
          locale={locale}
          onSave={(draft) => saveEvent(eventDialog, draft)}
          onClose={() => setEventDialog(null)}
        />
      )}
    </div>
  );
}
