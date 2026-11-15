"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { useLang } from "@/components/language-provider/language-provider";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { cn } from "@/lib/utils";
import { CalendarEventDialog } from "../calendar-event-dialog/calendar-event-dialog";
import { CalendarGrid } from "../calendar-grid/calendar-grid";
import { CalendarInsightsPanel, CalendarStockPanel } from "../calendar-panels/calendar-panels";
import { calendarChipTypes } from "./calendar-chip-types";
import { demoInsights, demoStock, mapCalendarDemoData } from "./calendar-demo-data";
import type { AiPlanChip, Chip, DbEvent, EventDialogState, EventDraft, InsightItem, StockItem } from "./calendar-types";
import { buildCalendarWeeks } from "./calendar-weeks";

const { weeks, holidayChips } = buildCalendarWeeks(new Date());
const { demoEvents, demoAgentInsights } = mapCalendarDemoData(weeks);
const visibleWeekCount = 4;
const toolbarButtonClassName = "flex items-center gap-1.5 px-2.5 py-1.5 font-sans text-xs";
const inactiveToolbarClassName = "bg-(--input-bg) text-(--subtle) hover:text-(--muted)";

export default function MarketingCalendar({ initialEvents }: { initialEvents: DbEvent[] }) {
  const { lang } = useLang();
  const [tab, setTab] = useState<"plan" | "agent" | "stock">("plan");
  const [scrollStart, setScrollStart] = useState(0);
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);
  const [dbEvents, setDbEvents] = useState<DbEvent[]>(initialEvents);
  const [stockData, setStockData] = useState<StockItem[]>(demoStock);
  const [insights, setInsights] = useState<InsightItem[]>(demoInsights);
  const [aiChips, setAiChips] = useState<AiPlanChip[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const [showAllStock, setShowAllStock] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/stock")
      .then((r) => r.json())
      .then((data: StockItem[]) => { if (data.length > 0) setStockData(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/calendar/insights")
      .then((r) => r.json())
      .then((data: InsightItem[]) => { if (data.length > 0) setInsights(data); })
      .catch(() => {});
  }, []);

  const visibleWeeks = weeks.slice(scrollStart, scrollStart + visibleWeekCount);

  const getChips = (rowKey: string, weekKey: string): Chip[] => {
    const demo = showDemo ? ((demoEvents[rowKey] ?? {})[weekKey] ?? []) : [];

    const user = dbEvents
      .filter((e) => e.rowKey === rowKey && e.weekKey === weekKey)
      .map((e) => ({ t: e.type, l: e.label, id: e.id }));

    const holidays = rowKey === "events" ? (holidayChips[weekKey] ?? []) : [];

    let agent: Chip[] = [];
    if (tab === "agent") {
      const aiRowChips = aiChips
        .filter((c) => c.weekKey === weekKey && c.rowKey === rowKey)
        .map((c) => ({ t: c.type, l: c.label }));

      const insightChips = insights
        .filter((ins) => ins.weekKey === weekKey
          && ins.rowKey === rowKey)
        .map((ins) => ({
          t: ins.type,
          l: ins.brand.length > 18 ? ins.brand.slice(0, 16) + "…" : ins.brand,
        }));

      const fallback = showDemo ? (demoAgentInsights[`${weekKey}_${rowKey}`] ?? []) : [];

      agent = aiRowChips.length > 0 ? aiRowChips
        : insightChips.length > 0 ? insightChips
        : fallback;
    }

    return [...holidays, ...demo, ...user, ...agent];
  };

  async function saveEvent(draft: EventDraft) {
    if (!eventDialog) return;

    const editing = eventDialog.mode === "edit";
    const response = await fetch(editing ? `/api/calendar/events/${eventDialog.id}` : "/api/calendar/events", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { type: draft.type, label: draft.label } : draft),
    });
    if (!response.ok) throw new Error("Calendar event save failed");

    const saved: DbEvent = await response.json();
    setDbEvents((previous) => editing
      ? previous.map((event) => event.id === saved.id ? saved : event)
      : [...previous, saved]);
  }

  async function deleteEvent(id: string) {
    setDeleteError(false);
    try {
      const response = await fetch(`/api/calendar/events/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Calendar event delete failed");

      setDbEvents((previous) => previous.filter((event) => event.id !== id));
    } catch {
      setDeleteError(true);
    }
  }

  const generateAiPlan = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/calendar/ai-plan", { method: "POST" });
      const data = await res.json();
      if (data.chips?.length > 0) {
        setAiChips(data.chips);
        setTab("agent");
      }
    } catch {
    } finally {
      setAiLoading(false);
    }
  };

  const locale = lang === "uk" ? "uk" : "en";
  const userCount = dbEvents.length;
  const labels = {
    plan:  lang === "uk" ? "Мій план"       : "My Plan",
    agent: lang === "uk" ? "Аналіз агента"  : "Agent Analysis",
    stock: lang === "uk" ? "Залишки"        : "Stock",
    addEvent: lang === "uk" ? "+ Додати подію" : "+ Add event",
    earlier:  lang === "uk" ? "← Раніше"      : "← Earlier",
    later:    lang === "uk" ? "Пізніше →"     : "Later →",
    events_in_plan:   lang === "uk" ? "Подій у плані"     : "Events in plan",
    agent_tips:       lang === "uk" ? "Порад агента"      : "Agent tips",
    warnings:         lang === "uk" ? "Попереджень"       : "Warnings",
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
          <p className="text-xs text-(--muted) mt-0.5 font-mono">
            {weeks[0] && weeks[weeks.length - 1]
              ? `${weeks[0].d.split("–")[0]} — ${weeks[weeks.length - 1].d.split("–")[1]}`
              : ""}
            {" · "}
            {lang === "uk" ? "Реальні дані" : "Live data"}
          </p>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Button
            onClick={generateAiPlan}
            disabled={aiLoading}
            className={cn(toolbarButtonClassName,
              aiChips.length > 0
                ? "bg-accent-purple/10 border-accent-purple/30 text-accent-purple"
                : inactiveToolbarClassName,
            )}
            title={lang === "uk" ? "Згенерувати план через AI" : "Generate AI plan"}
          >
            <Sparkles size={12} className={aiLoading ? "animate-pulse" : ""} />
            {aiLoading
              ? (lang === "uk" ? "Генеруємо…" : "Generating…")
              : aiChips.length > 0
              ? (lang === "uk" ? "AI план ✓" : "AI plan ✓")
              : (lang === "uk" ? "AI план" : "AI plan")}
          </Button>

          <Button
            onClick={() => setShowDemo((v) => !v)}
            aria-pressed={showDemo}
            title={showDemo
              ? (lang === "uk" ? "Сховати демо-шаблон" : "Hide demo template")
              : (lang === "uk" ? "Показати демо-шаблон" : "Show demo template")}
            className={cn(toolbarButtonClassName,
              showDemo
                ? "bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow"
                : inactiveToolbarClassName,
            )}
          >
            {showDemo ? <Eye size={12} /> : <EyeOff size={12} />}
            {lang === "uk" ? "Шаблон" : "Template"}
          </Button>

          <div className="flex bg-(--surface) border border-(--border) rounded-lg overflow-hidden">
            {(["plan", "agent", "stock"] as const).map((t) => (
              <Button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
                className={cn("rounded-none border-0 px-3 py-1.5 font-sans text-xs font-medium", tab === t && "bg-accent-cyan/10 text-accent-cyan")}>
                {labels[t]}
              </Button>
            ))}
          </div>
          <Button onClick={() => setEventDialog({ mode: "add", rowKey: "accent", weekKey: visibleWeeks[0]?.k ?? weeks[0]?.k ?? "w1" })}
            className="px-3 py-1.5 font-sans text-xs font-medium bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 rounded-lg hover:bg-accent-cyan/20 transition-colors">
            {labels.addEvent}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { v: `${(showDemo ? 68 : 0) + userCount}`, l: labels.events_in_plan, c: "text-(--text)" },
          { v: String(insights.filter((i) => i.type === "agent").length), l: labels.agent_tips, c: "text-accent-positive" },
          { v: String(insights.filter((i) => i.type === "warn").length),  l: labels.warnings,   c: "text-accent-negative" },
        ].map((s, i) => (
          <div key={i} className="bg-(--surface) border border-(--border) rounded-xl p-3 text-center">
            <div className={`text-lg font-bold font-mono ${s.c}`}>{s.v}</div>
            <div className="text-[10px] text-(--muted) mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-3 flex-wrap">
        {Object.entries(calendarChipTypes).map(([key, chip]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`size-2.5 rounded-xs border border-(--border) ${chip.fill}`} />
            <span className="text-[10px] text-(--muted)">{chip.legend[locale]}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-2">
        <Button onClick={() => setScrollStart(Math.max(0, scrollStart - 1))} disabled={scrollStart === 0}
          className="flex items-center gap-1 border-0 p-0 font-sans text-xs hover:bg-transparent disabled:opacity-30">
          <ChevronLeft size={14} /> {labels.earlier}
        </Button>
        <span className="text-[10px] font-mono text-(--subtle)">
          {visibleWeeks[0]?.d} — {visibleWeeks[visibleWeeks.length - 1]?.d}
        </span>
        <Button onClick={() => setScrollStart(Math.min(weeks.length - visibleWeekCount, scrollStart + 1))} disabled={scrollStart >= weeks.length - visibleWeekCount}
          className="flex items-center gap-1 border-0 p-0 font-sans text-xs hover:bg-transparent disabled:opacity-30">
          {labels.later} <ChevronRight size={14} />
        </Button>
      </div>

      {deleteError && <p role="alert" className="mb-2 text-sm text-accent-danger">{lang === "uk" ? "Не вдалося видалити подію." : "Could not delete the event."}</p>}
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
          onSave={saveEvent}
          onClose={() => setEventDialog(null)}
        />
      )}
    </div>
  );
}
