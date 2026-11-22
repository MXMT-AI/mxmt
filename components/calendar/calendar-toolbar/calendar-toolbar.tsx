import { Eye, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { panel } from "@/components/ui/panel/panel-styles";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import type { CalendarTab } from "../marketing-calendar/calendar-types";
import { calendarCalendarToolbarMessages as englishCopy } from "@/messages/en.json";
import { calendarCalendarToolbarMessages as ukrainianCopy } from "@/messages/uk.json";

const buttonClassName = "flex items-center gap-1.5 px-2.5 py-1.5 font-sans text-xs";
const inactiveClassName = "bg-(--input-bg) text-(--subtle) hover:text-(--muted)";
const tabs = ["plan", "agent", "stock"] as const;

export function CalendarToolbar({ locale, tab, onTabChange, showDemo, onToggleDemo, aiLoading, hasAiPlan, onGenerate, onAdd }: {
  locale: Locale;
  tab: CalendarTab;
  onTabChange: (tab: CalendarTab) => void;
  showDemo: boolean;
  onToggleDemo: () => void;
  aiLoading: boolean;
  hasAiPlan: boolean;
  onGenerate: () => void;
  onAdd: () => void;
}) {
  const uk = locale === "uk";
  const labels = uk
    ? { plan: ukrainianCopy.planМійПлан, agent: ukrainianCopy.agentАналізАгента, stock: ukrainianCopy.stockЗалишки }
    : { plan: englishCopy.planMyPlan, agent: englishCopy.agent, stock: "Stock" };

  return (
    <div className="flex gap-2 items-center flex-wrap">
      <Button
        onClick={onGenerate}
        disabled={aiLoading}
        className={cn(buttonClassName, hasAiPlan ? "bg-accent-purple/10 border-accent-purple/30 text-accent-purple" : inactiveClassName)}
        title={uk ? ukrainianCopy.titleGenerateAIPlan : englishCopy.titleGenerateAIPlan}
      >
        <Sparkles size={12} aria-hidden="true" className={aiLoading ? "motion-safe:animate-pulse" : undefined} />
        {aiLoading ? (uk ? ukrainianCopy.generating : englishCopy.generating) : hasAiPlan ? (uk ? ukrainianCopy.aIPlan : englishCopy.aIPlan) : (uk ? ukrainianCopy.aIPlan2 : englishCopy.aIPlan2)}
      </Button>
      <Button
        onClick={onToggleDemo}
        aria-pressed={showDemo}
        title={showDemo ? (uk ? ukrainianCopy.titleHideDemoTemplate : englishCopy.titleHideDemoTemplate) : (uk ? ukrainianCopy.titleShowDemoTemplate : englishCopy.titleShowDemoTemplate)}
        className={cn(buttonClassName, showDemo ? "bg-accent-yellow/10 border-accent-yellow/30 text-accent-yellow" : inactiveClassName)}
      >
        {showDemo ? <Eye size={12} aria-hidden="true" /> : <EyeOff size={12} aria-hidden="true" />}
        {uk ? ukrainianCopy.template : englishCopy.template}
      </Button>
      <div className={cn(panel, "flex rounded-lg overflow-hidden")}>
        {tabs.map(value => (
          <Button key={value} onClick={() => onTabChange(value)} aria-pressed={tab === value}
            className={cn("rounded-none border-0 px-3 py-1.5 font-sans text-xs font-medium", tab === value && "bg-accent-cyan/10 text-accent-cyan")}>
            {labels[value]}
          </Button>
        ))}
      </div>
      <Button onClick={onAdd} tone="positive" className="px-3 py-1.5 font-sans text-xs font-medium">
        {uk ? ukrainianCopy.addEvent : englishCopy.addEvent}
      </Button>
    </div>
  );
}
