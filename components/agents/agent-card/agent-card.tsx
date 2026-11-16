import { Badge } from "@/components/ui/badge/badge";
import { AgentStatusIcon } from "../agent-status-icon/agent-status-icon";
import { agentStatusPresentation, getAgentRunState } from "../agent-status";
import { Link } from "@/i18n/navigation";
import { useState, useEffect } from "react";
import { Play, RefreshCw, Table2, Eye, Code2 } from "lucide-react";
import { getAgentProvider } from "@/lib/client/agent-providers";
import PromoTableModal, { type PromoSimParams } from "@/components/agents/promo-table-modal/promo-table-modal";
import ReorderTableModal, { type ReorderSimParams } from "@/components/agents/reorder-table-modal/reorder-table-modal";
import { AGENTS, AGENT_ROUTES } from "@/components/agents/agents.config";
import type { AgentRunInfo, BrandResult } from "@/components/agents/agents.types";
import { buildReorderParams, buildSimParams, duration, fmtDate, formatWohDays } from "@/components/agents/agents.utils";
import RecommendationApprovalModal, { type ApprovalRecommendation } from "@/components/agents/recommendation-approval-modal/recommendation-approval-modal";
import { AnalysisModal } from "../analysis-modal/analysis-modal";
import { DebugModal } from "../debug-modal/debug-modal";
import { BrandCard } from "../brand-card/brand-card";
import { badgeStyle, campaignHealthLabel, campaignHealthClasses, campaignStatusColor, campaignMetricLabel } from "../agent-card-presentation";

import { InsightList } from "../insight-list/insight-list";
import { buildCategoryInsightRows, buildChannelInsightRows, type CategoryInsight, type ChannelInsight } from "../insight-list/insight-rows";
import { ResultSummary } from "./result-summary/result-summary";

export function AgentCard({
  agent,
  run,
  onRun,
  isFirst,
  dependenciesReady,
}: {
  agent: (typeof AGENTS)[0];
  run?: AgentRunInfo;
  onRun: () => void | Promise<void>;
  isFirst: boolean;
  dependenciesReady: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [simParams, setSimParams] = useState<PromoSimParams | null>(null);
  const [reorderParams, setReorderParams] = useState<ReorderSimParams | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<ApprovalRecommendation | null>(null);
  const [provider, setProvider] = useState<string>("openai");
  const toggleExpanded = () => setExpanded((value) => !value);
  const Icon = agent.icon;
  const { status: s, isStale } = getAgentRunState(run);
  const { color: statusTextColor, label: statusLabel } = agentStatusPresentation[s];
  const output = isStale ? {} : (run?.output ?? {});

  const brands: BrandResult[] = agent.id === "inventory_analyst" ? (output.brands ?? []) : [];
  const criticalCount = brands.filter((b) => b.status === "critical").length;
  const warningCount = brands.filter((b) => b.status === "warning").length;

  const channels: ChannelInsight[] = output.channels ?? output.metrics?.channels ?? [];
  const topChannel: string = output.top_channel ?? "";

  const byCategory: CategoryInsight[] = output.by_category ?? output.metrics?.byCategory ?? [];
  const bestsellers: string[] = output.bestsellers ?? output.metrics?.topCategories ?? [];
  const deadStock: string[] = output.dead_stock ?? output.metrics?.deadCategories ?? [];

  const decisionBrands: any[] = agent.id === "repricing" || agent.id === "reordering"
    ? (output.brands ?? [])
    : [];
  const recommendedCount = decisionBrands.filter((b: any) => {
    const items: any[] = b.options ?? b.scenarios ?? [];
    return items.some((i: any) => i.evaluation?.recommended);
  }).length;

  const marketerBrands: any[] = agent.id === "commercial_marketer" ? (output.brands ?? []) : [];

  const annotations: any[] = agent.id === "calendar_agent" ? (output.annotations ?? []) : [];
  const planningRecommendations: ApprovalRecommendation[] = agent.id === "calendar_agent"
    ? (output.planning_recommendations ?? [])
    : [];
  const healthScore: any = output.health_score ?? null;
  const criticalAnnotations = annotations.filter((a: any) => a.priority === "critical").length;

  const campaigns: any[] = agent.id === "campaign_analysis" ? (output.campaigns ?? []) : [];
  const campaignOverallHealth: string = output.overall_health ?? "";
  const campaignsBehind = campaigns.filter((c: any) => c.status === "behind" || c.status === "stalled").length;
  const activeCampaignCount = output.active_campaign_count ?? campaigns.length;
  const scheduledCampaignCount = output.scheduled_campaign_count ?? campaigns.length;
  const pendingRecommendations = output.pending_recommendations ?? 0;

  const isWeeklyReport = agent.id === "weekly_report";
  const weeklyPriorities: any[] = isWeeklyReport ? (output.top_priorities ?? []) : [];
  const weeklyDecisions: string[] = isWeeklyReport ? (output.decisions_needed ?? []) : [];

  useEffect(() => {
    setProvider(getAgentProvider(agent.id));
    const onStorage = () => setProvider(getAgentProvider(agent.id));
    window.addEventListener("mxmt_providers_changed", onStorage);
    return () => window.removeEventListener("mxmt_providers_changed", onStorage);
  }, [agent.id]);

  return (
    <div
      className="agent-card bg-(--surface2) border border-(--border) border-s-[3px] border-s-(--signal) rounded-xl overflow-hidden"
    >
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-(--signal-wash) text-(--signal-ink)"
            >
              <Icon size={17} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="wrap-break-word text-sm font-semibold text-(--text)">{agent.label}</h3>
                <Badge tone="subtle" size="small" outlined={false}>
                  {agent.model}
                </Badge>
                {agent.model !== "Rules v1" && (
                  <Badge tone="subtle" size="small" outlined={false}>
                    {provider === "openai" ? "OpenAI" : "Anthropic"}
                  </Badge>
                )}
                {!AGENT_ROUTES[agent.id] && (
                  <span className="text-[9px] font-mono text-(--subtle)">• скоро</span>
                )}
              </div>
              <p className="text-[11px] text-(--muted) mt-0.5">{agent.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AgentStatusIcon status={s} />
            <button
              type="button"
              onClick={onRun}
              disabled={s === "running" || !dependenciesReady}
              title={!dependenciesReady ? "Спочатку завершіть залежні агенти для поточного періоду" : undefined}
              aria-label={`${s === "running" ? "Агент працює" : "Запустити агента"} ${agent.label}`}
              className="flex min-h-11 items-center gap-1.5 rounded-lg border border-(--signal-line) bg-(--signal-wash) px-2.5 py-1.5 text-xs font-semibold text-(--signal-ink) transition-colors touch-manipulation enabled:hover:bg-(--signal-hover) disabled:cursor-not-allowed disabled:border-(--border) disabled:bg-(--input-bg) disabled:text-(--muted)"
            >
              {s === "running" ? (
                <RefreshCw size={11} className="motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Play size={11} aria-hidden="true" />
              )}
              {s === "running" ? "Працює…" : !dependenciesReady ? "Очікує дані" : "Запустити"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-(--subtle)">
          <span>
            Статус:{" "}
            <span className={statusTextColor}>
              {isStale ? "застаріло" : statusLabel}
            </span>
          </span>
          {run?.finishedAt && (
            <span>Останній запуск: <span className="text-(--muted)">{fmtDate(run.finishedAt)}</span></span>
          )}
          {duration(run) && (
            <span>Час: <span className="text-(--muted)">{duration(run)}</span></span>
          )}
        </div>

        {s === "done" && brands.length > 0 && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded} label={`Детально (${brands.length} брендів) ↓`}>
            {criticalCount > 0 && (
              <Badge tone="danger">
                {criticalCount} критичних
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge tone="warning">
                {warningCount} попереджень
              </Badge>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <Badge tone="positive">
                Все гаразд
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "done" && channels.length > 0 && brands.length === 0 && byCategory.length === 0 && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded}>
            {topChannel && (
              <Badge tone="positive">
                Лідер за кількістю: {topChannel}
              </Badge>
            )}
            <Badge>
              {channels.length} каналів
            </Badge>
          </ResultSummary>
        )}

        {s === "done" && byCategory.length > 0 && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded} label={`Детально (${byCategory.length} категорій) ↓`}>
            {bestsellers.length > 0 && (
              <Badge tone="positive">
                Бестселери: {bestsellers.slice(0, 2).join(", ")}
              </Badge>
            )}
            {deadStock.length > 0 && (
              <Badge tone="danger">
                Dead stock: {deadStock.length} категорій
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "done" && decisionBrands.length > 0 && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded}>
            <Badge tone="accent">
              {decisionBrands.length} {agent.id === "repricing" ? "брендів до уцінки" : "брендів до дозамовлення"}
            </Badge>
            {recommendedCount > 0 && (
              <Badge tone="positive">
                {recommendedCount} рекомендацій готово
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "done" && marketerBrands.length > 0 && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded}>
            <Badge tone="warning">
              {marketerBrands.length} брифів готово
            </Badge>
            {marketerBrands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").length > 0 && (
              <Badge tone="danger">
                {marketerBrands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").length} термінових
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "done" && (annotations.length > 0 || healthScore) && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded}>
            {healthScore?.coverage_percent != null && (
              <Badge tone="warning">
                Покриття: {healthScore.coverage_percent}%
              </Badge>
            )}
            {healthScore?.recommendation_count != null && (
              <Badge>
                {healthScore.scheduled_recommendations ?? 0} заплановано / {healthScore.recommendation_count} рекомендовано
              </Badge>
            )}
            {criticalAnnotations > 0 && (
              <Badge tone="danger">
                {criticalAnnotations} критичних прогалин
              </Badge>
            )}
            {annotations.length > 0 && (
              <Badge>
                {annotations.length} анотацій
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "done" && agent.id === "campaign_analysis" && campaignOverallHealth && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded}>
            {campaignOverallHealth && (
              <Badge className={campaignHealthClasses(campaignOverallHealth)}>
                {campaignHealthLabel(campaignOverallHealth)}
              </Badge>
            )}
            <Badge>
              {activeCampaignCount} активних
            </Badge>
            {scheduledCampaignCount > 0 && (
              <Badge>
                {scheduledCampaignCount} у календарі
              </Badge>
            )}
            {pendingRecommendations > 0 && (
              <Badge tone="warning">
                {pendingRecommendations} очікують погодження
              </Badge>
            )}
            {campaignsBehind > 0 && (
              <Badge tone="danger">
                {campaignsBehind} відстають
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "done" && isWeeklyReport && (output.pm_brief || output.summary) && (
          <ResultSummary expanded={expanded} onToggle={toggleExpanded} label="Показати звіт ↓">
            {output.week && (
              <Badge tone="report">
                {output.week}
              </Badge>
            )}
            {weeklyPriorities.length > 0 && (
              <Badge>
                {weeklyPriorities.length} пріоритетів
              </Badge>
            )}
            {weeklyDecisions.length > 0 && (
              <Badge tone="warning">
                {weeklyDecisions.length} рішень PM
              </Badge>
            )}
          </ResultSummary>
        )}

        {s === "error" && run?.errorMsg && (
          <p className="mt-2 text-[11px] text-accent-danger font-mono">{run.errorMsg}</p>
        )}

        {s === "done" && brands.length === 0 && decisionBrands.length === 0 && marketerBrands.length === 0 && annotations.length === 0 && campaigns.length === 0 && !isWeeklyReport && run?.output?.message && (
          <p className="mt-2 text-[11px] text-(--muted)">{run.output.message}</p>
        )}
        {s === "done" && isWeeklyReport && !output.pm_brief && run?.output?.message && (
          <p className="mt-2 text-[11px] text-(--muted)">{run.output.message}</p>
        )}

        {s === "done" && (output.summary || output.brands?.length || output.channels?.length || output.by_category?.length || decisionBrands.length > 0 || marketerBrands.length > 0 || annotations.length > 0 || campaigns.length > 0 || (isWeeklyReport && output.pm_brief)) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-[10px] font-mono text-(--muted) hover:text-(--text) transition-colors border border-(--border) rounded-lg px-3 py-1.5 hover:bg-(--input-bg)"
            >
              <Eye size={11} aria-hidden="true" />
              Переглянути аналіз
            </button>
            {output._debug && (
              <button
                type="button"
                onClick={() => setShowDebug(true)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-(--subtle) hover:text-(--text) transition-colors border border-(--border) rounded-lg px-3 py-1.5 hover:bg-(--input-bg)"
                title="Промт, дані та сирий відповідь AI"
              >
                <Code2 size={11} aria-hidden="true" />
                Трасування
              </button>
            )}
          </div>
        )}
      </div>

      {expanded && brands.length > 0 && (
        <div className="border-t border-(--border) px-4 py-3 space-y-2">
          {brands.map((b) => (
            <BrandCard key={b.brand_id} b={b} />
          ))}
        </div>
      )}

      {expanded && channels.length > 0 && brands.length === 0 && (
        <InsightList
          capitalizeTitles
          summary={output.summary}
          action={output.action}
          rows={buildChannelInsightRows(channels, "card")}
        />
      )}

      {expanded && byCategory.length > 0 && (
        <InsightList
          summary={output.summary}
          action={output.action}
          rows={buildCategoryInsightRows(byCategory, "card")}
        />
      )}

      {expanded && decisionBrands.length > 0 && (
        <div className="border-t border-(--border) px-4 py-4 space-y-4">
          {decisionBrands.map((brand: any) => {
            const items: any[] = brand.options ?? brand.scenarios ?? [];
            const recommended = items.find((i: any) => i.evaluation?.recommended);
            return (
              <div key={brand.brand_id} className="border border-accent-purple/20 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-accent-purple/5 flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-sm text-(--text)">{brand.brand_name}</span>
                    {brand.current_situation && (
                      <p className="text-[11px] text-(--muted) mt-0.5">{brand.current_situation}</p>
                    )}
                  </div>
                  {recommended && (
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-sm bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan shrink-0 ml-3">
                      ✓ {recommended.label}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-(--border)">
                  {items.map((item: any) => {
                    const isRec = item.evaluation?.recommended;
                    const score = item.evaluation?.score ?? 0;
                    return (
                      <div
                        key={item.option_id ?? item.scenario_id}
                        className="px-4 py-3"
                        style={{ background: isRec ? "color-mix(in srgb, var(--cyan-ink) 5%, transparent)" : undefined }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm" style={{
                            background: "var(--signal-wash)", color: "var(--signal-ink)",
                          }}>
                            {item.strategy_type ?? item.type}
                          </span>
                          <span className="text-[12px] font-semibold text-(--text)">{item.label}</span>
                          {isRec && (
                            <span className="text-[9px] font-mono text-accent-cyan ml-auto">★ РЕКОМЕНДОВАНО</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-mono text-(--muted) mt-1 flex-wrap">
                          {item.discount_percent !== undefined && (
                            <span>Знижка: <span className="text-(--text)">-{item.discount_percent}%</span></span>
                          )}
                          {item.duration_days && (
                            <span>Строк: <span className="text-(--text)">{item.duration_days}д</span></span>
                          )}
                          {item.forecast && (
                            <span>Днів запасу після (DOH): <span className="text-(--text)">
                              {item.forecast.woh_after == null ? "недостатньо даних" : formatWohDays(item.forecast.woh_after)}
                            </span></span>
                          )}
                          {item.woh_after !== undefined && (
                            <span>Днів запасу після (DOH): <span className="text-(--text)">{formatWohDays(item.woh_after)}</span></span>
                          )}
                          {item.qty_multiplier !== undefined && (
                            <span>Обʼєм: <span className="text-(--text)">×{item.qty_multiplier}</span></span>
                          )}
                          <span className="ml-auto">
                            Оцінка: <span style={{ color: score >= 7 ? "var(--cyan-ink)" : score >= 5 ? "var(--amber-ink)" : "var(--danger-ink)" }}>
                              {score}/10
                            </span>
                          </span>
                        </div>
                        {item.evaluation?.risks?.length > 0 && (
                          <p className="text-[10px] text-accent-yellow mt-1.5">
                            ⚠ {item.evaluation.risks[0]}
                          </p>
                        )}
                        {agent.id === "repricing" && item.discount_percent > 0 && brand.brand_id && (
                          <button
                            type="button"
                            onClick={() => setSimParams(buildSimParams(brand, item, output._debug))}
                            className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-lg border transition-colors"
                            style={{ borderColor: "var(--signal-line)", background: "var(--signal-wash)", color: "var(--signal-ink)" }}
                          >
                            <Table2 size={11} aria-hidden="true" />
                            Переглянути в таблиці
                          </button>
                        )}
                        {agent.id === "reordering" && item.qty_multiplier > 0 && brand.brand_id && (
                          <button
                            type="button"
                            onClick={() => setReorderParams(buildReorderParams(brand, item, output._debug))}
                            className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-lg border transition-colors"
                            style={{ borderColor: "var(--signal-line)", background: "var(--signal-wash)", color: "var(--signal-ink)" }}
                          >
                            <Table2 size={11} aria-hidden="true" />
                            Переглянути в таблиці
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && marketerBrands.length > 0 && (
        <div className="border-t border-(--border) px-4 py-4 space-y-4">
          {output.summary && <p className="text-sm text-(--muted)">{output.summary}</p>}
          {marketerBrands.map((brand: any) => (
            <div key={brand.brand_id} className="border border-accent-yellow/20 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-accent-yellow/5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm text-(--text)">{brand.brand_name}</span>
                  {brand.decision_summary && <p className="text-[11px] text-(--muted) mt-0.5">{brand.decision_summary}</p>}
                </div>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded shrink-0 ml-3 ${
                  brand.urgency === "critical" ? "bg-accent-danger/10 text-accent-danger" :
                  brand.urgency === "high" ? "bg-accent-yellow/10 text-accent-yellow" :
                  "bg-(--input-bg) text-(--muted)"
                }`}>{(brand.urgency ?? "medium").toUpperCase()}</span>
              </div>
              {brand.key_message && (
                <div className="px-4 py-2 border-b border-(--border) bg-(--surface2)">
                  <span className="text-[9px] font-mono text-(--subtle) uppercase tracking-wide">Ключове повідомлення: </span>
                  <span className="text-[12px] text-(--text)">"{brand.key_message}"</span>
                </div>
              )}
              <div className="divide-y divide-(--border)">
                {Object.entries(brand.channels ?? {}).map(([ch, v]: [string, any]) => v?.action_needed ? (
                  <div key={ch} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-yellow/15 text-accent-yellow uppercase shrink-0 mt-0.5">{ch}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-(--text)">{v.brief}</p>
                      {v.frequency && <p className="text-[10px] text-(--muted) mt-0.5">Частота: {v.frequency}</p>}
                      {v.send_timing && <p className="text-[10px] text-(--muted) mt-0.5">Відправити: {v.send_timing}</p>}
                      {v.budget_recommendation && <p className="text-[10px] text-accent-cyan mt-0.5">Бюджет: {v.budget_recommendation}</p>}
                    </div>
                  </div>
                ) : null)}
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && (annotations.length > 0 || healthScore) && (
        <div className="border-t border-(--border) px-4 py-4 space-y-3">
          {healthScore?.summary && <p className="text-sm text-(--muted)">{healthScore.summary}</p>}
          {output.summary && output.summary !== healthScore?.summary && (
            <p className="text-sm text-(--muted)">{output.summary}</p>
          )}
          {annotations.map((ann: any, i: number) => {
            const prioColor = ann.priority === "critical" ? "var(--danger-ink)" : ann.priority === "high" ? "var(--amber-ink)" : ann.priority === "medium" ? "var(--violet-ink)" : "var(--muted)";
            const typeIcon = ann.type === "suggestion" ? "+" : ann.type === "gap" ? "○" : ann.type === "conflict" ? "✕" : ann.type === "timing" ? "⏱" : "✓";
            const recommendation = planningRecommendations.find((item) => item.recommendation_id === ann.id && item.status === "draft");
            const scheduledRecommendation = planningRecommendations.find((item) => item.recommendation_id === ann.id && item.status === "scheduled");
            return (
              <div key={ann.id ?? i} className="border border-(--border) rounded-xl p-3">
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-[10px] font-mono" style={{ color: prioColor }}>{typeIcon} {(ann.type ?? "").toUpperCase()}</span>
                  {ann.channel && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-yellow/15 text-accent-yellow">{ann.channel}</span>}
                  {ann.brand && <span className="text-[9px] font-mono text-(--subtle)">{ann.brand}</span>}
                  <span className="text-[9px] font-mono ml-auto" style={{ color: prioColor }}>{(ann.priority ?? "").toUpperCase()}</span>
                </div>
                <p className="text-[12px] text-(--text)">{ann.message}</p>
                {ann.suggested_action && (
                  <p className="text-[11px] text-accent-cyan mt-1">→ {ann.suggested_action}</p>
                )}
                {recommendation && run?.id && (
                  <button
                    type="button"
                    onClick={() => setApprovalTarget(recommendation)}
                    className="mt-3 rounded-lg border border-accent-yellow/30 bg-accent-yellow/10 px-3 py-1.5 text-[10px] font-mono font-semibold text-accent-yellow hover:bg-accent-yellow/15"
                  >
                    Погодити й додати до календаря
                  </button>
                )}
                {scheduledRecommendation && (
                  <Link
                    href="/calendar"
                    className="mt-3 inline-flex rounded-lg border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-1.5 text-[10px] font-mono font-semibold text-accent-cyan hover:bg-accent-cyan/15"
                  >
                    Відкрити в календарі
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {expanded && agent.id === "campaign_analysis" && (campaigns.length > 0 || output.summary) && (
        <div className="border-t border-(--border) px-4 py-4 space-y-3">
          {output.summary && <p className="text-sm text-(--muted)">{output.summary}</p>}
          {campaigns.map((camp: any, i: number) => {
            const statusColor = campaignStatusColor(camp.status);
            return (
              <div key={camp.campaign_id ?? i} className="border border-(--border) rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-semibold text-sm text-(--text)">{camp.brand_name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm" style={badgeStyle(statusColor)}>
                    {camp.status?.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono text-(--subtle) ml-auto">{campaignMetricLabel(camp)}</span>
                </div>
                {camp.actual_observation && <p className="text-[11px] text-(--muted) mb-1">{camp.actual_observation}</p>}
                {camp.next_action && <p className="text-[11px] text-accent-cyan">→ {camp.next_action}</p>}
              </div>
            );
          })}
        </div>
      )}

      {expanded && isWeeklyReport && (output.pm_brief || output.marketing_brief) && (
        <div className="border-t border-(--border) px-4 py-4 space-y-4">
          {output.summary && (
            <p className="text-sm text-(--text) font-medium">{output.summary}</p>
          )}
          {output.pm_brief && (
            <div className="bg-(--row) rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">PM Brief</div>
              <p className="text-[12px] text-(--text) leading-relaxed">{output.pm_brief}</p>
            </div>
          )}
          {output.marketing_brief && (
            <div className="bg-(--row) rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Marketing Brief</div>
              <p className="text-[12px] text-(--text) leading-relaxed">{output.marketing_brief}</p>
            </div>
          )}
          {weeklyPriorities.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Пріоритети</div>
              <div className="space-y-2">
                {weeklyPriorities.map((p: any) => (
                  <div key={p.rank} className="flex items-start gap-3 py-2 border-b border-(--border) last:border-0">
                    <span className="text-[11px] font-mono font-bold text-accent-report w-5 shrink-0">#{p.rank}</span>
                    <div className="min-w-0">
                      <span className="text-[11px] text-(--text)">{p.action}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.brand && p.brand !== "все" && <span className="text-[9px] font-mono text-(--subtle)">{p.brand}</span>}
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm ${p.deadline === "today" ? "bg-accent-danger/10 text-accent-danger" : p.deadline === "tomorrow" ? "bg-accent-yellow/10 text-accent-yellow" : "bg-(--input-bg) text-(--muted)"}`}>
                          {p.deadline}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {weeklyDecisions.length > 0 && (
            <div className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-xl p-3">
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow mb-2">Рішення PM</div>
              <ul className="space-y-1">
                {weeklyDecisions.map((d: string, i: number) => (
                  <li key={i} className="text-[11px] text-(--text)">· {d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {showModal && run?.output && (
        <AnalysisModal
          agentId={agent.id}
          agentLabel={agent.label}
          output={run.output}
          onClose={() => setShowModal(false)}
        />
      )}

      {showDebug && run?.output?._debug && (
        <DebugModal
          agentLabel={agent.label}
          debug={run.output._debug}
          runId={run.id}
          duration={duration(run)}
          onClose={() => setShowDebug(false)}
        />
      )}

      {simParams && (
        <PromoTableModal params={simParams} onClose={() => setSimParams(null)} />
      )}

      {reorderParams && (
        <ReorderTableModal params={reorderParams} onClose={() => setReorderParams(null)} />
      )}

      {approvalTarget && run?.id && (
        <RecommendationApprovalModal
          key={approvalTarget.recommendation_id}
          calendarRunId={run.id}
          recommendation={approvalTarget}
          weekKeys={Array.isArray(output.weeksAnalyzed) ? output.weeksAnalyzed : []}
          onClose={() => setApprovalTarget(null)}
          onApproved={onRun}
        />
      )}
    </div>
  );
}
