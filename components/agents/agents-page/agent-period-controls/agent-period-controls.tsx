import { useState } from "react";
import { AlertTriangle, CalendarDays, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button/button";
import { DateField } from "@/components/ui/date-field/date-field";
import type { StoredAgentPeriod } from "@/lib/agent-period";
import { InfoModal } from "../../info-modal/info-modal";
import { PeriodNotice } from "../period-notice/period-notice";

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
          <span className="font-mono text-[10px] tracking-widest text-(--subtle) uppercase">Період даних</span>
        </div>
        <DateField
          id="agents-date-from"
          name="agents-date-from"
          label="від"
          aria-label="Дата початку періоду"
          value={dateFrom}
          max={maxStartDate}
          onChange={(event) => onPeriodChange({ analysisDate, dateFrom: event.target.value })}
        />
        <DateField
          id="agents-date-to"
          name="agents-date-to"
          label="до"
          aria-label="Дата завершення періоду"
          value={analysisDate}
          min={dateFrom || undefined}
          max={today}
          onChange={(event) => {
            const endDate = event.target.value || today;
            onPeriodChange({ analysisDate: endDate, dateFrom: dateFrom < endDate ? dateFrom : "" });
          }}
        />
        {(isHistoricalDate || hasDateFrom) && (
          <Button onClick={() => onPeriodChange({ analysisDate: today, dateFrom: "" })}>Скинути</Button>
        )}
        {!isHistoricalDate && !hasDateFrom && (
          <span className="text-[10px] font-mono text-accent-cyan">Останні 30 днів (стандарт)</span>
        )}
        {hasDateFrom && (
          <span className="text-[10px] font-mono text-accent-purple">Період: {periodDays} дн.</span>
        )}
        <Button className="ml-auto" onClick={() => setShowInfo(true)}>
          <Info size={11} aria-hidden="true" />
          Важлива інформація
        </Button>
      </div>

      {hasDateFrom && (
        <div className="mt-3">
          <PeriodNotice icon={Info} tone="accent" title={`Власний період (${periodDays} дн.):`}>
            швидкість продажів і WOH рахуються за весь період <span className="text-(--text)">{dateFrom} — {analysisDate}</span> замість стандартних 30 днів. Тренд = друга половина періоду проти першої. Дані раніше дати «від» агенти не бачать.
          </PeriodNotice>
        </div>
      )}

      {isHistoricalDate && (
        <div className="mt-3 space-y-2">
          <PeriodNotice icon={AlertTriangle} tone="warning" title="Блоки 1–2:">
            Метрики продажів пораховані {hasDateFrom ? `за період ${dateFrom} — ${analysisDate}` : `за 7/30 днів до ${analysisDate}`}. Залишки на складі — найближчий знімок до дати <span className="text-(--text)">{analysisDate}</span> (якщо щоденні знімки не записувались, будуть використані поточні залишки).
          </PeriodNotice>
          <PeriodNotice icon={AlertTriangle} tone="accent" title="Блок 3 (Execution):">
            Commercial Marketer та Calendar Agent генерують рекомендації на майбутнє — при минулій даті вони будуть ретроспективними, не actionable.
          </PeriodNotice>
          <PeriodNotice icon={Clock} tone="neutral" title="Блок 4 (Tracking):">
            Campaign Analysis та Weekly Report читають збережені результати інших агентів — обрана дата майже не впливає на їх вивід.
          </PeriodNotice>
        </div>
      )}

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
