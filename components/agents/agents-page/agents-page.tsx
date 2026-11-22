"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle, Zap } from "lucide-react";
import { AGENTS, AGENT_BLOCKS } from "@/components/agents/agents.config";
import { areAgentDependenciesReady } from "@/components/agents/agents.utils";
import { useAgentRuns } from "@/components/agents/use-agent-runs";
import { AGENT_PERIOD_STORAGE_KEY, parseStoredAgentPeriod, type StoredAgentPeriod } from "@/lib/agent-period";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { agentStatusPresentation } from "../agent-status";
import { AgentPeriodControls } from "./agent-period-controls/agent-period-controls";
import { AgentCard } from "../agent-card/agent-card";
import { PipelineDiagram } from "../pipeline-diagram/pipeline-diagram";
import { agentsAgentsPageMessages as englishCopy } from "@/messages/en.json";
import { agentsAgentsPageMessages as ukrainianCopy } from "@/messages/uk.json";

export default function AgentsPage({ savedPeriod }: { savedPeriod?: StoredAgentPeriod }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [analysisDate, setAnalysisDate] = useState(savedPeriod?.analysisDate ?? todayStr);
  const [dateFrom, setDateFrom] = useState(savedPeriod?.dateFrom ?? "");
  const [periodRestored, setPeriodRestored] = useState(Boolean(savedPeriod));
  const useBrowserPeriod = !savedPeriod;

  useEffect(() => {
    if (!useBrowserPeriod) return;
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
  }, [useBrowserPeriod, todayStr]);

  useEffect(() => {
    if (!periodRestored || !useBrowserPeriod) return;
    try {
      localStorage.setItem(
        AGENT_PERIOD_STORAGE_KEY,
        JSON.stringify({ analysisDate, dateFrom })
      );
    } catch {
    }
  }, [analysisDate, dateFrom, periodRestored, useBrowserPeriod]);

  const { runs, loading, statusError, fetchStatus, handleRun } = useAgentRuns({
    analysisDate,
    dateFrom,
    todayStr,
    enabled: periodRestored,
    preferSaved: Boolean(savedPeriod),
  });
  const totalDone = Object.values(runs).filter((r) => r.status === "done").length;
  const totalError = Object.values(runs).filter((r) => r.status === "error").length;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <header className="agent-workspace-header mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Heading as="h1" variant="page">{ukrainianCopy.агенти}</Heading>
            <p className="mt-1 text-sm text-(--muted) tabular-nums" role="status">
              <strong className="text-accent-cyan">{totalDone}{ukrainianCopy.із}{AGENTS.length}</strong>{ukrainianCopy.виконано}{totalError > 0 && <span className="text-accent-danger ml-2">· {totalError}{ukrainianCopy.помилок}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-(--subtle)">
              <Zap size={11} className="text-accent-yellow" aria-hidden="true" />{englishCopy.openAIGPT4oGPT4oMini}</div>
            <Button
              variant="icon"
              onClick={() => void fetchStatus(true)}
              aria-label={ukrainianCopy.ariaLabelОновитиСтатусАгентів}
              title={ukrainianCopy.titleОновитиСтатус}
            >
              <RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {statusError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-accent-danger/30 bg-accent-danger/10 px-4 py-3 text-xs text-accent-danger">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{statusError}</span>
        </div>
      )}

      <AgentPeriodControls
        today={todayStr}
        analysisDate={analysisDate}
        dateFrom={dateFrom}
        onPeriodChange={(period) => {
          setAnalysisDate(period.analysisDate);
          setDateFrom(period.dateFrom);
        }}
      />

      <PipelineDiagram runs={runs} />

      <div className="space-y-6">
        {AGENT_BLOCKS.map((block) => (
          <section key={block.id} data-stage={block.id} aria-labelledby={`agent-stage-${block.id}`}>
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2
                id={`agent-stage-${block.id}`}
                className="rounded-md border border-(--signal-line) bg-(--signal-wash) px-3 py-1 text-xs font-semibold text-(--signal-ink)"
              >{ukrainianCopy.блок}{block.id} — {block.label}
              </h2>
              <p className="text-xs text-(--subtle)">{block.desc}</p>
              <div className="h-px flex-1 bg-(--border)" />
            </div>
            <div className="space-y-3">
              {block.agents.map((agent) => (
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
        ))}
      </div>

      <div className="mt-8 pt-4 border-t border-(--border) flex items-center gap-6 flex-wrap">
        {Object.entries(agentStatusPresentation).map(([status, { color, label }]) => (
          <div key={status} className="flex items-center gap-1.5 text-[10px] font-mono text-(--muted)">
            <span aria-hidden="true" className={`size-2 rounded-full bg-current ${color}`} />
            <span className="first-letter:uppercase">{label}</span>
          </div>
        ))}
        <span className="text-[10px] font-mono text-(--subtle) ml-auto">
          {AGENTS.length}{ukrainianCopy.агентів}{AGENT_BLOCKS.length}{ukrainianCopy.блокиПовнийПайплайн}</span>
      </div>
    </div>
  );
}
