import { useState } from "react";
import { AlertTriangle, CalendarDays, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { DateField } from "@/components/ui/date-field/date-field";
import type { StoredAgentPeriod } from "@/lib/agent-period";
import { InfoModal } from "../../info-modal/info-modal";
import { PeriodNotice } from "../period-notice/period-notice";
import { formatMessage } from "@/i18n/format-message";
import { agentsAgentsPageAgentPeriodControlsMessages as ukrainianCopy } from "@/messages/uk.json";

const dayInMs = 86_400_000;

type AgentPeriodControlsProps = StoredAgentPeriod & {
  today: string;
  onPeriodChange: (period: StoredAgentPeriod) => void;
};

export function AgentPeriodControls({ analysisDate, dateFrom, today, onPeriodChange }: AgentPeriodControlsProps) {
  const [showInfo, setShowInfo] = useState(false);
  const isHistoricalDate = analysisDate !== today;
  const hasDateFrom = dateFrom !== "";
  const endMs = new Date(analysisDate).getTime();
  const maxStartDate = new Date(endMs - dayInMs).toISOString().slice(0, 10);
  const periodDays = hasDateFrom ? Math.max(1, Math.round((endMs - new Date(dateFrom).getTime()) / dayInMs)) : 30;

  return (
    <div className="mb-4 rounded-xl border border-(--border) bg-(--surface2) p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <CalendarDays size={14} className="text-(--subtle)" aria-hidden="true" />
          <span className="font-mono text-[10px] tracking-widest text-(--subtle) uppercase">{ukrainianCopy.періодДаних}</span>
        </div>
        <DateField
          id="agents-date-from"
          name="agents-date-from"
          label={ukrainianCopy.labelВід}
          aria-label={ukrainianCopy.ariaLabelДатаПочаткуПеріоду}
          value={dateFrom}
          max={maxStartDate}
          onChange={(event) => onPeriodChange({ analysisDate, dateFrom: event.target.value })}
        />
        <DateField
          id="agents-date-to"
          name="agents-date-to"
          label={ukrainianCopy.labelДо}
          aria-label={ukrainianCopy.ariaLabelДатаЗавершенняПеріоду}
          value={analysisDate}
          min={dateFrom || undefined}
          max={today}
          onChange={(event) => {
            const endDate = event.target.value || today;
            onPeriodChange({ analysisDate: endDate, dateFrom: dateFrom < endDate ? dateFrom : "" });
          }}
        />
        {(isHistoricalDate || hasDateFrom) && (
          <Button onClick={() => onPeriodChange({ analysisDate: today, dateFrom: "" })}>{ukrainianCopy.скинути}</Button>
        )}
        {!isHistoricalDate && !hasDateFrom && (
          <span className="text-[10px] font-mono text-accent-cyan">{ukrainianCopy.останні30ДнівСтандарт}</span>
        )}
        {hasDateFrom && (
          <span className="text-[10px] font-mono text-accent-purple">{ukrainianCopy.період}{periodDays}{ukrainianCopy.дн}</span>
        )}
        <Button className="ml-auto" onClick={() => setShowInfo(true)}>
          <Info size={11} aria-hidden="true" />{ukrainianCopy.важливаІнформація}</Button>
      </div>

      {hasDateFrom && (
        <div className="mt-3">
          <PeriodNotice icon={Info} tone="accent" title={formatMessage(ukrainianCopy.titleВласнийПеріодДн, { periodDays })}>{ukrainianCopy.швидкістьПродажівІWOHРахуються}<span className="text-(--text)">{dateFrom} — {analysisDate}</span>{ukrainianCopy.замістьСтандартних30ДнівТренд}</PeriodNotice>
        </div>
      )}

      {isHistoricalDate && (
        <div className="mt-3 space-y-2">
          <PeriodNotice icon={AlertTriangle} tone="warning" title={ukrainianCopy.titleБлоки12}>{ukrainianCopy.метрикиПродажівПораховані}{hasDateFrom ? formatMessage(ukrainianCopy.заПеріод, { dateFrom, analysisDate }) : formatMessage(ukrainianCopy.за730ДнівДо, { analysisDate })}{ukrainianCopy.залишкиНаСкладі}<span className="text-(--text)">{analysisDate}</span>{ukrainianCopy.якщоЩоденніЗнімкиНеЗаписувались}</PeriodNotice>
          <PeriodNotice icon={AlertTriangle} tone="accent" title={ukrainianCopy.titleБлок3Execution}>{ukrainianCopy.commercialMarketerТаCalendarAgent}</PeriodNotice>
          <PeriodNotice icon={Clock} tone="neutral" title={ukrainianCopy.titleБлок4Tracking}>{ukrainianCopy.campaignAnalysisТаWeeklyReport}</PeriodNotice>
        </div>
      )}

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
