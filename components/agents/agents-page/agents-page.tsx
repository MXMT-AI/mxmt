"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle, Clock, Zap, CalendarDays, Info } from "lucide-react";
import { AGENTS, BLOCKS } from "@/components/agents/agents.config";
import { areAgentDependenciesReady } from "@/components/agents/agents.utils";
import { useAgentRuns } from "@/components/agents/use-agent-runs";
import { AGENT_PERIOD_STORAGE_KEY, parseStoredAgentPeriod } from "@/lib/agent-period";
import { InfoModal } from "../info-modal/info-modal";
import { AgentCard } from "../agent-card/agent-card";
import { PipelineDiagram } from "../pipeline-diagram/pipeline-diagram";

export default function AgentsPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [analysisDate, setAnalysisDate] = useState(todayStr);
  const [dateFrom, setDateFrom] = useState("");
  const [periodRestored, setPeriodRestored] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    try {
      const stored = parseStoredAgentPeriod(
        localStorage.getItem(AGENT_PERIOD_STORAGE_KEY),
        todayStr
      );
      if (stored) {
        setAnalysisDate(stored.analysisDate);
        setDateFrom(stored.dateFrom);
      }
    } catch {
    } finally {
      setPeriodRestored(true);
    }
  }, [todayStr]);

  useEffect(() => {
    if (!periodRestored) return;
    try {
      localStorage.setItem(
        AGENT_PERIOD_STORAGE_KEY,
        JSON.stringify({ analysisDate, dateFrom })
      );
    } catch {
    }
  }, [analysisDate, dateFrom, periodRestored]);

  const { runs, loading, statusError, fetchStatus, handleRun } = useAgentRuns({
    analysisDate,
    dateFrom,
    todayStr,
    enabled: periodRestored,
  });
  const isHistoricalDate = analysisDate !== todayStr;
  const hasDateFrom = dateFrom !== "";
  const maxFromStr = new Date(new Date(analysisDate).getTime() - 86400000).toISOString().slice(0, 10);
  const periodDays = hasDateFrom
    ? Math.max(1, Math.round((new Date(analysisDate).getTime() - new Date(dateFrom).getTime()) / 86400000))
    : 30;

  const totalDone = Object.values(runs).filter((r) => r.status === "done").length;
  const totalError = Object.values(runs).filter((r) => r.status === "error").length;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="agent-workspace-header mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-(--text)">Агенти</h1>
            <p className="mt-1 text-sm text-(--muted) tabular-nums" role="status">
              <strong className="text-accent-cyan">{totalDone} із {AGENTS.length}</strong> виконано
              {totalError > 0 && <span className="text-accent-danger ml-2">· {totalError} помилок</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-(--subtle)">
              <Zap size={11} className="text-accent-yellow" aria-hidden="true" />
              OpenAI GPT-4o / GPT-4o mini
            </div>
            <button
              type="button"
              onClick={fetchStatus}
              aria-label="Оновити статус агентів"
              className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-(--border) bg-(--surface) text-(--muted) transition-colors hover:bg-(--input-bg) hover:text-(--text)"
              title="Оновити статус"
            >
              <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {statusError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-accent-danger/30 bg-accent-danger/10 px-4 py-3 text-xs text-accent-danger">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{statusError}</span>
        </div>
      )}

      <div className="mb-4 bg-(--surface2) border border-(--border) rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarDays size={14} className="text-(--subtle)" aria-hidden="true" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-(--subtle)">Період даних</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="agents-date-from" className="text-[10px] font-mono text-(--subtle)">від</label>
            <input
              id="agents-date-from"
              name="agents-date-from"
              type="date"
              value={dateFrom}
              max={maxFromStr}
              aria-label="Дата початку періоду"
              onChange={(e) => setDateFrom(e.target.value || "")}
              className="min-h-11 rounded-lg border border-(--border) bg-(--input-bg) px-3 py-1.5 font-mono text-xs text-(--text)"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="agents-date-to" className="text-[10px] font-mono text-(--subtle)">до</label>
            <input
              id="agents-date-to"
              name="agents-date-to"
              type="date"
              value={analysisDate}
              min={hasDateFrom ? dateFrom : undefined}
              max={todayStr}
              aria-label="Дата завершення періоду"
              onChange={(e) => {
                const v = e.target.value || todayStr;
                setAnalysisDate(v);
                if (dateFrom && v <= dateFrom) setDateFrom("");
              }}
              className="min-h-11 rounded-lg border border-(--border) bg-(--input-bg) px-3 py-1.5 font-mono text-xs text-(--text)"
            />
          </div>
          {(isHistoricalDate || hasDateFrom) && (
            <button
              type="button"
              onClick={() => { setAnalysisDate(todayStr); setDateFrom(""); }}
              className="text-[10px] font-mono px-2.5 py-1 rounded-lg border border-(--border) text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
            >
              Скинути
            </button>
          )}
          {!isHistoricalDate && !hasDateFrom && (
            <span className="text-[10px] font-mono text-accent-cyan">Останні 30 днів (стандарт)</span>
          )}
          {hasDateFrom && (
            <span className="text-[10px] font-mono text-accent-purple">Період: {periodDays} дн.</span>
          )}
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg border border-(--border) text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
          >
            <Info size={11} aria-hidden="true" />
            Важлива інформація
          </button>
        </div>

        {hasDateFrom && (
          <div className="mt-3 flex items-start gap-2 bg-accent-purple/5 border border-accent-purple/20 rounded-lg px-3 py-2.5">
            <Info size={12} className="text-accent-purple shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-(--muted) leading-relaxed">
              <span className="text-accent-purple font-semibold">Власний період ({periodDays} дн.):</span> швидкість продажів і WOH рахуються за весь період <span className="text-(--text)">{dateFrom} — {analysisDate}</span> замість стандартних 30 днів. Тренд = друга половина періоду проти першої. Дані раніше дати «від» агенти не бачать.
            </p>
          </div>
        )}

        {isHistoricalDate && (
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 bg-accent-yellow/5 border border-accent-yellow/20 rounded-lg px-3 py-2.5">
              <AlertTriangle size={12} className="text-accent-yellow shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-(--muted) leading-relaxed">
                <span className="text-accent-yellow font-semibold">Блоки 1–2:</span> Метрики продажів пораховані {hasDateFrom ? `за період ${dateFrom} — ${analysisDate}` : `за 7/30 днів до ${analysisDate}`}. Залишки на складі — найближчий знімок до дати <span className="text-(--text)">{analysisDate}</span> (якщо щоденні знімки не записувались, будуть використані поточні залишки).
              </p>
            </div>
            <div className="flex items-start gap-2 bg-accent-purple/5 border border-accent-purple/20 rounded-lg px-3 py-2.5">
              <AlertTriangle size={12} className="text-accent-purple shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-(--muted) leading-relaxed">
                <span className="text-accent-purple font-semibold">Блок 3 (Execution):</span> Commercial Marketer та Calendar Agent генерують рекомендації на майбутнє — при минулій даті вони будуть ретроспективними, не actionable.
              </p>
            </div>
            <div className="flex items-start gap-2 bg-[#6b7a8d]/5 border border-[#6b7a8d]/20 rounded-lg px-3 py-2.5">
              <Clock size={12} className="text-(--subtle) shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-(--muted) leading-relaxed">
                <span className="text-(--text) font-semibold">Блок 4 (Tracking):</span> Campaign Analysis та Weekly Report читають збережені результати інших агентів — обрана дата майже не впливає на їх вивід.
              </p>
            </div>
          </div>
        )}
      </div>

      <PipelineDiagram runs={runs} />

      <div className="space-y-6">
        {BLOCKS.map((block) => {
          const blockAgents = AGENTS.filter((a) => a.block === block.id);
          return (
            <section key={block.id} data-stage={block.id} aria-labelledby={`agent-stage-${block.id}`}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2
                  id={`agent-stage-${block.id}`}
                  className="rounded-md border border-(--signal-line) bg-(--signal-wash) px-3 py-1 text-xs font-semibold text-(--signal-ink)"
                >
                  Блок {block.id} — {block.label}
                </h2>
                <p className="text-xs text-(--subtle)">{block.desc}</p>
                <div className="h-px flex-1 bg-(--border)" />
              </div>
              <div className="space-y-3">
                {blockAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    run={runs[agent.id]}
                    onRun={() => handleRun(agent.id)}
                    isFirst={agent.id === "inventory_analyst"}
                    dependenciesReady={areAgentDependenciesReady(agent, runs)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      <div className="mt-8 pt-4 border-t border-(--border) flex items-center gap-6 flex-wrap">
        {[
          { color: "var(--subtle)", label: "Очікування" },
          { color: "var(--amber-ink)", label: "Працює" },
          { color: "var(--cyan-ink)", label: "Готово" },
          { color: "var(--danger-ink)", label: "Помилка" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono text-(--muted)">
            <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
            {item.label}
          </div>
        ))}
        <span className="text-[10px] font-mono text-(--subtle) ml-auto">
          9 агентів · 4 блоки · повний пайплайн
        </span>
      </div>
    </div>
  );
}
