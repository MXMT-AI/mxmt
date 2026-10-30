"use client";

import { Link } from "@/i18n/navigation";
import { useState, useEffect, useRef } from "react";
import {
  Play, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp,
  Zap, Table2,
  CalendarDays, X, Eye, Code2, Info,
} from "lucide-react";
import { getAgentProvider } from "@/components/settings/AgentProvidersCard";
import PromoTableModal, { type PromoSimParams } from "@/components/agents/PromoTableModal";
import ReorderTableModal, { type ReorderSimParams } from "@/components/agents/ReorderTableModal";
import { AGENTS, AGENT_ROUTES, BLOCKS } from "@/components/agents/agents.config";
import type { AgentRunInfo, AgentStatus, BrandResult, BrandStatus } from "@/components/agents/agents.types";
import { areAgentDependenciesReady, buildReorderParams, buildSimParams, duration, fmt, fmtDate, formatWohDays, statusColor, statusLabel } from "@/components/agents/agents.utils";
import DebugSection from "@/components/agents/DebugSection";
import RecommendationApprovalModal, { type ApprovalRecommendation } from "@/components/agents/RecommendationApprovalModal";
import { useAgentRuns } from "@/components/agents/useAgentRuns";
import {
  AGENT_PERIOD_STORAGE_KEY,
  parseStoredAgentPeriod,
} from "@/lib/agent-period";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agentStatusIcon(s: AgentStatus) {
  if (s === "running") return <RefreshCw size={12} className="animate-spin text-accent-yellow" aria-hidden="true" />;
  if (s === "done") return <CheckCircle2 size={12} className="text-accent-cyan" aria-hidden="true" />;
  if (s === "error") return <AlertTriangle size={12} className="text-[#ef4444]" aria-hidden="true" />;
  return <Clock size={12} className="text-(--subtle)" aria-hidden="true" />;
}

function campaignHealthLabel(status: string) {
  if (status === "on_track") return "На правильному шляху";
  if (status === "critical") return "Критичний стан";
  if (status === "not_started") return "Ще не запущено";
  if (status === "insufficient_data") return "Недостатньо даних";
  return "Потребує уваги";
}

function campaignHealthClasses(status: string) {
  if (status === "on_track") return "bg-accent-cyan/5 border-accent-cyan/20 text-accent-cyan";
  if (status === "critical") return "bg-[#ef4444]/5 border-[#ef4444]/20 text-[#ef4444]";
  if (status === "not_started") return "bg-(--input-bg) border-(--border) text-(--muted)";
  return "bg-accent-yellow/5 border-accent-yellow/20 text-accent-yellow";
}

function campaignStatusColor(status: string) {
  if (status === "ahead") return "#00e5c4";
  if (status === "on_track") return "#86efac";
  if (status === "behind") return "#fbbf24";
  if (status === "insufficient_data" || status === "scheduled") return "#6b7a8d";
  return "#ef4444";
}

function campaignMetricLabel(campaign: any) {
  if (campaign.days_running == null || campaign.performance_score == null) return "метрики відсутні";
  return `${campaign.days_running}д · ${campaign.performance_score}/10`;
}

// ─── Full analysis modal ──────────────────────────────────────────────────────

function AnalysisModal({
  agentId,
  agentLabel,
  output,
  onClose,
}: {
  agentId: string;
  agentLabel: string;
  output: Record<string, any>;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [simParams, setSimParams] = useState<PromoSimParams | null>(null);
  const [reorderParams, setReorderParams] = useState<ReorderSimParams | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const statusBadge = (status: string, map: Record<string, string>) => {
    const color = map[status] ?? "#6b7a8d";
    return (
      <span
        className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm ml-2 shrink-0"
        style={{ background: color + "20", color, border: `1px solid ${color}30` }}
      >
        {status?.toUpperCase()}
      </span>
    );
  };

  const brandColors: Record<string, string> = {
    critical: "#ef4444", warning: "#fbbf24", excellent: "#00e5c4", balanced: "#6b7a8d",
  };
  const channelColors: Record<string, string> = {
    best: "#00e5c4", normal: "#6b7a8d", weak: "#fbbf24", inactive: "#fbbf24",
  };
  const catColors: Record<string, string> = {
    bestseller: "#00e5c4", normal: "#6b7a8d", slow: "#fbbf24", dead: "#ef4444",
    stockout: "#60a5fa", inactive: "#6b7a8d",
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-modal-title"
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-(--border) bg-(--surface)"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-(--surface) border-b border-(--border) px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-0.5">
              Повний аналіз
            </div>
            <h2 id="analysis-modal-title" className="text-base font-bold text-(--text)">{agentLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити повний аналіз"
            className="w-8 h-8 rounded-lg border border-(--border) flex items-center justify-center text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Summary */}
          {output.summary && (
            <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">
                Загальний висновок
              </div>
              <p className="text-sm text-(--text) leading-relaxed">{output.summary}</p>
            </div>
          )}

          {/* Action */}
          {output.action && (
            <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan/70 mb-2">
                Головна дія
              </div>
              <p className="text-sm text-accent-cyan font-medium leading-relaxed">{output.action}</p>
            </div>
          )}

          {/* Inventory Analyst — brands */}
          {agentId === "inventory_analyst" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">
                Аналіз по брендах ({output.brands.length})
              </div>
              <div className="space-y-3">
                {output.brands.map((b: any) => (
                  <div key={b.brand_id ?? b.brand_name} className="border border-(--border) rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-(--text)">{b.brand_name}</span>
                      {statusBadge(b.status, brandColors)}
                    </div>
                    {b.analysis && (
                      <p className="text-[12px] text-(--muted) leading-relaxed mb-2">{b.analysis}</p>
                    )}
                    {Array.isArray(b.suggested_actions) && b.suggested_actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {b.suggested_actions.map((a: string) => (
                          <span key={a} className="text-[10px] font-mono px-2 py-0.5 bg-(--row) border border-(--border) rounded-sm text-(--muted)">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Channel Analytics — channels */}
          {agentId === "channel_analytics" && Array.isArray(output.channels) && output.channels.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">
                Аналіз по каналах ({output.channels.length})
              </div>
              <div className="space-y-3">
                {output.channels.map((c: any, i: number) => (
                  <div key={i} className="border border-(--border) rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-(--text) capitalize">{c.channel}</span>
                      {statusBadge(c.status, channelColors)}
                    </div>
                    {c.insight && (
                      <p className="text-[12px] text-(--muted) leading-relaxed mb-2">{c.insight}</p>
                    )}
                    {c.recommendation && (
                      <p className="text-[12px] text-accent-cyan">→ {c.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Attributes — categories */}
          {agentId === "product_attributes" && Array.isArray(output.by_category) && output.by_category.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">
                Аналіз по категоріях ({output.by_category.length})
              </div>
              <div className="space-y-3">
                {output.by_category.map((c: any, i: number) => (
                  <div key={i} className="border border-(--border) rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-(--text)">{c.category || c.attribute}</span>
                      {statusBadge(c.status, catColors)}
                    </div>
                    {c.insight && (
                      <p className="text-[12px] text-(--muted) leading-relaxed mb-2">{c.insight}</p>
                    )}
                    {c.recommendation && (
                      <p className="text-[12px] text-accent-cyan">→ {c.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bestsellers / Dead stock tags (product_attributes) */}
          {agentId === "product_attributes" && (
            <div className="flex gap-4 flex-wrap">
              {Array.isArray(output.bestsellers) && output.bestsellers.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Бестселери</div>
                  <div className="flex flex-wrap gap-1.5">
                    {output.bestsellers.map((b: string) => (
                      <span key={b} className="text-[10px] font-mono px-2 py-0.5 bg-accent-cyan/10 border border-accent-cyan/20 rounded-sm text-accent-cyan">{b}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(output.dead_stock) && output.dead_stock.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Dead Stock</div>
                  <div className="flex flex-wrap gap-1.5">
                    {output.dead_stock.map((d: string) => (
                      <span key={d} className="text-[10px] font-mono px-2 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-sm text-[#ef4444]">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Repricing — options per brand */}
          {agentId === "repricing" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div className="space-y-5">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle)">
                Стратегії уцінки ({output.brands.length} брендів)
              </div>
              {output.brands.map((brand: any) => (
                <div key={brand.brand_id} className="border border-(--border) rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-accent-purple/5 border-b border-(--border)">
                    <span className="font-semibold text-sm text-(--text)">{brand.brand_name}</span>
                    {brand.current_situation && (
                      <p className="text-[11px] text-(--muted) mt-0.5">{brand.current_situation}</p>
                    )}
                  </div>
                  <div className="divide-y divide-(--border)">
                    {(brand.options ?? []).map((opt: any) => (
                      <div key={opt.option_id} className="px-4 py-4" style={{ background: opt.evaluation?.recommended ? "#00e5c4" + "07" : undefined }}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-purple/15 text-accent-purple">{opt.strategy_type}</span>
                          <span className="font-semibold text-sm text-(--text)">{opt.label}</span>
                          {opt.evaluation?.recommended && (
                            <span className="text-[9px] font-mono text-accent-cyan ml-auto">★ РЕКОМЕНДОВАНО · {opt.evaluation.score}/10</span>
                          )}
                          {!opt.evaluation?.recommended && opt.evaluation?.score && (
                            <span className="text-[9px] font-mono text-(--subtle) ml-auto">{opt.evaluation.score}/10</span>
                          )}
                        </div>
                        <div className="flex gap-4 text-[10px] font-mono text-(--muted) mb-3 flex-wrap">
                          {opt.discount_percent > 0 && <span>Знижка <span className="text-(--text)">-{opt.discount_percent}%</span></span>}
                          {opt.duration_days && <span>Строк <span className="text-(--text)">{opt.duration_days}д</span></span>}
                          {opt.forecast && (
                            <span>Днів запасу після (DOH) <span className="text-(--text)">
                              {opt.forecast.woh_after == null ? "недостатньо даних" : formatWohDays(opt.forecast.woh_after)}
                            </span></span>
                          )}
                          {opt.forecast?.margin_after_percent != null && (
                            <span>Маржа після <span className={opt.forecast.margin_after_percent < 10 ? "text-[#ef4444]" : "text-accent-cyan"}>
                              {opt.forecast.margin_after_percent}%
                            </span></span>
                          )}
                        </div>
                        {opt.evaluation?.pros?.length > 0 && (
                          <ul className="space-y-0.5 mb-2">
                            {opt.evaluation.pros.map((p: string, i: number) => (
                              <li key={i} className="text-[11px] text-[#86efac]">+ {p}</li>
                            ))}
                          </ul>
                        )}
                        {opt.evaluation?.cons?.length > 0 && (
                          <ul className="space-y-0.5 mb-2">
                            {opt.evaluation.cons.map((c: string, i: number) => (
                              <li key={i} className="text-[11px] text-(--muted)">− {c}</li>
                            ))}
                          </ul>
                        )}
                        {opt.evaluation?.risks?.length > 0 && (
                          <ul className="space-y-0.5">
                            {opt.evaluation.risks.map((r: string, i: number) => (
                              <li key={i} className="text-[11px] text-accent-yellow">⚠ {r}</li>
                            ))}
                          </ul>
                        )}
                        {opt.discount_percent > 0 && brand.brand_id && (
                          <button
                            type="button"
                            onClick={() => setSimParams(buildSimParams(brand, opt, output._debug))}
                            className="mt-3 flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-lg border transition-colors"
                            style={{ borderColor: "#a78bfa40", background: "#a78bfa12", color: "#a78bfa" }}
                          >
                            <Table2 size={11} aria-hidden="true" />
                            Переглянути в таблиці
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reordering — scenarios per brand */}
          {agentId === "reordering" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div className="space-y-5">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle)">
                Сценарії дозамовлення ({output.brands.length} брендів)
              </div>
              {output.brands.map((brand: any) => (
                <div key={brand.brand_id} className="border border-(--border) rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-accent-purple/5 border-b border-(--border)">
                    <span className="font-semibold text-sm text-(--text)">{brand.brand_name}</span>
                    {brand.current_situation && (
                      <p className="text-[11px] text-(--muted) mt-0.5">{brand.current_situation}</p>
                    )}
                  </div>
                  <div className="divide-y divide-(--border)">
                    {(brand.scenarios ?? []).map((sc: any) => {
                      const riskColor = sc.evaluation?.risk_level === "HIGH" ? "#ef4444" : sc.evaluation?.risk_level === "LOW" ? "#00e5c4" : "#fbbf24";
                      return (
                        <div key={sc.scenario_id} className="px-4 py-4" style={{ background: sc.evaluation?.recommended ? "#00e5c4" + "07" : undefined }}>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-purple/15 text-accent-purple">{sc.type}</span>
                            <span className="font-semibold text-sm text-(--text)">{sc.label}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm ml-1" style={{ background: riskColor + "20", color: riskColor }}>
                              {sc.evaluation?.risk_level} RISK
                            </span>
                            {sc.evaluation?.recommended && (
                              <span className="text-[9px] font-mono text-accent-cyan ml-auto">★ РЕКОМЕНДОВАНО · {sc.evaluation.score}/10</span>
                            )}
                            {!sc.evaluation?.recommended && sc.evaluation?.score && (
                              <span className="text-[9px] font-mono text-(--subtle) ml-auto">{sc.evaluation.score}/10</span>
                            )}
                          </div>
                          <div className="flex gap-4 text-[10px] font-mono text-(--muted) mb-3 flex-wrap">
                            {sc.qty_multiplier != null && <span>Обʼєм <span className="text-(--text)">×{sc.qty_multiplier}</span></span>}
                            {sc.woh_after != null && <span>Днів запасу після (DOH) <span className="text-(--text)">{formatWohDays(sc.woh_after)}</span></span>}
                            {sc.logic && <span className="text-(--subtle)">{sc.logic}</span>}
                          </div>
                          {sc.evaluation?.pros?.length > 0 && (
                            <ul className="space-y-0.5 mb-2">
                              {sc.evaluation.pros.map((p: string, i: number) => (
                                <li key={i} className="text-[11px] text-[#86efac]">+ {p}</li>
                              ))}
                            </ul>
                          )}
                          {sc.evaluation?.risks?.length > 0 && (
                            <ul className="space-y-0.5">
                              {sc.evaluation.risks.map((r: string, i: number) => (
                                <li key={i} className="text-[11px] text-accent-yellow">⚠ {r}</li>
                              ))}
                            </ul>
                          )}
                          {sc.qty_multiplier > 0 && brand.brand_id && (
                            <button
                              type="button"
                              onClick={() => setReorderParams(buildReorderParams(brand, sc, output._debug))}
                              className="mt-3 flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded-lg border transition-colors"
                              style={{ borderColor: "#a78bfa40", background: "#a78bfa12", color: "#a78bfa" }}
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
              ))}
            </div>
          )}
          {/* Commercial Marketer — channel briefs */}
          {agentId === "commercial_marketer" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div className="space-y-5">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle)">
                Маркетингові брифи ({output.brands.length} брендів)
              </div>
              {output.brands.map((brand: any) => (
                <div key={brand.brand_id} className="border border-(--border) rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-accent-yellow/5 border-b border-(--border)">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-(--text)">{brand.brand_name}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm ${brand.urgency === "critical" ? "bg-[#ef4444]/10 text-[#ef4444]" : "bg-accent-yellow/10 text-accent-yellow"}`}>
                        {(brand.urgency ?? "").toUpperCase()}
                      </span>
                    </div>
                    {brand.decision_summary && <p className="text-[11px] text-(--muted) mt-0.5">{brand.decision_summary}</p>}
                    {brand.key_message && <p className="text-[12px] text-(--text) mt-1 italic">"{brand.key_message}"</p>}
                  </div>
                  <div className="divide-y divide-(--border)">
                    {Object.entries(brand.channels ?? {}).map(([ch, v]: [string, any]) => (
                      <div key={ch} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-yellow/15 text-accent-yellow uppercase">{ch}</span>
                          {!v?.action_needed && <span className="text-[9px] font-mono text-(--subtle)">не потрібно</span>}
                          {v?.priority && <span className="text-[9px] font-mono text-(--subtle) ml-auto">пріоритет {v.priority}</span>}
                        </div>
                        {v?.brief && <p className="text-[12px] text-(--muted) leading-relaxed">{v.brief}</p>}
                        {v?.frequency && <p className="text-[11px] text-(--text) mt-1">📅 {v.frequency}</p>}
                        {v?.send_timing && <p className="text-[11px] text-(--text) mt-1">📤 Відправити: {v.send_timing}</p>}
                        {v?.cta && <p className="text-[11px] text-accent-cyan mt-1">CTA: {v.cta}</p>}
                        {v?.budget_recommendation && <p className="text-[11px] text-accent-cyan mt-1">💰 {v.budget_recommendation}</p>}
                        {v?.staff_talking_points && <p className="text-[11px] text-(--muted) mt-1 italic">"{v.staff_talking_points}"</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Campaign Analysis — campaigns */}
          {agentId === "campaign_analysis" && (
            <div className="space-y-3">
              {output.overall_health && (
                <div className={`border rounded-xl p-4 ${campaignHealthClasses(output.overall_health)}`}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1">
                    Загальний стан кампаній
                  </div>
                  <p className="text-sm font-semibold text-(--text)">
                    {campaignHealthLabel(output.overall_health)}
                  </p>
                  {output.summary && <p className="text-[12px] text-(--muted) mt-1">{output.summary}</p>}
                </div>
              )}
              {Array.isArray(output.campaigns) && output.campaigns.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">Кампанії ({output.campaigns.length})</div>
                  <div className="space-y-3">
                    {output.campaigns.map((camp: any, i: number) => {
                      const sc = campaignStatusColor(camp.status);
                      return (
                        <div key={camp.campaign_id ?? i} className="border border-(--border) rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-semibold text-sm text-(--text)">{camp.brand_name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm" style={{ background: sc + "20", color: sc, border: `1px solid ${sc}30` }}>{camp.status?.toUpperCase()}</span>
                            <span className="text-[9px] font-mono text-(--subtle) ml-auto">{campaignMetricLabel(camp)}</span>
                          </div>
                          {camp.planned_action && <p className="text-[11px] text-(--subtle) mb-1">📋 {camp.planned_action}</p>}
                          {camp.actual_observation && <p className="text-[12px] text-(--muted) mb-2">{camp.actual_observation}</p>}
                          {camp.next_action && <p className="text-[11px] text-accent-cyan">→ {camp.next_action}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Weekly Report */}
          {agentId === "weekly_report" && (
            <div className="space-y-4">
              {output.pm_brief && (
                <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">PM Brief</div>
                  <p className="text-sm text-(--text) leading-relaxed">{output.pm_brief}</p>
                </div>
              )}
              {output.marketing_brief && (
                <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Marketing Brief</div>
                  <p className="text-sm text-(--text) leading-relaxed">{output.marketing_brief}</p>
                </div>
              )}
              {Array.isArray(output.top_priorities) && output.top_priorities.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">Топ пріоритети</div>
                  <div className="space-y-2">
                    {output.top_priorities.map((p: any) => (
                      <div key={p.rank} className="flex items-start gap-3 border border-(--border) rounded-xl p-3">
                        <span className="text-base font-bold text-[#fb923c] w-6 shrink-0">#{p.rank}</span>
                        <div className="min-w-0">
                          <p className="text-[12px] text-(--text)">{p.action}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {p.brand && p.brand !== "все" && <span className="text-[10px] font-mono text-(--subtle)">{p.brand}</span>}
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm ${p.deadline === "today" ? "bg-[#ef4444]/10 text-[#ef4444]" : p.deadline === "tomorrow" ? "bg-accent-yellow/10 text-accent-yellow" : "bg-(--input-bg) text-(--muted)"}`}>
                              {p.deadline}
                            </span>
                            {p.type && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-[#fb923c]/10 text-[#fb923c]">{p.type}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(output.decisions_needed) && output.decisions_needed.length > 0 && (
                <div className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow/70 mb-2">Рішення PM</div>
                  <ul className="space-y-1.5">
                    {output.decisions_needed.map((d: string, i: number) => (
                      <li key={i} className="text-[12px] text-(--text)">· {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(output.wins) && output.wins.length > 0 && (
                <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan/70 mb-2">Перемоги тижня</div>
                  <ul className="space-y-1.5">
                    {output.wins.map((w: string, i: number) => (
                      <li key={i} className="text-[12px] text-(--text)">✓ {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {output.next_week_focus && (
                <div className="border border-(--border) rounded-xl p-3">
                  <span className="text-[9px] font-mono text-(--subtle) uppercase tracking-wide">Фокус наст. тижня: </span>
                  <span className="text-[12px] text-(--text)">{output.next_week_focus}</span>
                </div>
              )}
            </div>
          )}

          {/* Calendar Agent — annotations */}
          {agentId === "calendar_agent" && (
            <div className="space-y-3">
              {output.health_score && (
                <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Готовність плану</div>
                  <div className="flex items-center gap-4 text-[12px] font-mono flex-wrap">
                    <span>Покриття: <span className={output.health_score.coverage_percent >= 70 ? "text-accent-cyan" : "text-accent-yellow"}>{output.health_score.coverage_percent}%</span></span>
                    {output.health_score.recommendation_count != null && (
                      <span>Заплановано: <span className="text-(--text)">{output.health_score.scheduled_recommendations ?? 0}/{output.health_score.recommendation_count}</span></span>
                    )}
                    {output.health_score.critical_gaps > 0 && <span>Критичних: <span className="text-[#ef4444]">{output.health_score.critical_gaps}</span></span>}
                    {output.health_score.high_gaps > 0 && <span>Важливих: <span className="text-accent-yellow">{output.health_score.high_gaps}</span></span>}
                  </div>
                  {output.health_score.summary && <p className="text-[12px] text-(--muted) mt-2">{output.health_score.summary}</p>}
                </div>
              )}
              {Array.isArray(output.annotations) && output.annotations.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">
                    Анотації ({output.annotations.length})
                  </div>
                  <div className="space-y-2">
                    {output.annotations.map((ann: any, i: number) => {
                      const prioColor = ann.priority === "critical" ? "#ef4444" : ann.priority === "high" ? "#fbbf24" : ann.priority === "medium" ? "#a78bfa" : "#6b7a8d";
                      return (
                        <div key={ann.id ?? i} className="border border-(--border) rounded-xl p-3" style={{ borderLeftColor: prioColor, borderLeftWidth: 3 }}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[9px] font-mono uppercase font-bold" style={{ color: prioColor }}>{ann.type}</span>
                            {ann.channel && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-yellow/15 text-accent-yellow">{ann.channel}</span>}
                            {ann.brand && <span className="text-[9px] font-mono text-(--subtle)">{ann.brand}</span>}
                            <span className="text-[9px] font-mono ml-auto" style={{ color: prioColor }}>{ann.priority?.toUpperCase()}</span>
                          </div>
                          <p className="text-[12px] text-(--text) leading-relaxed">{ann.message}</p>
                          {ann.suggested_action && <p className="text-[11px] text-accent-cyan mt-1">→ {ann.suggested_action}</p>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Promo simulation table */}
      {simParams && (
        <PromoTableModal params={simParams} onClose={() => setSimParams(null)} />
      )}

      {/* Reorder simulation table */}
      {reorderParams && (
        <ReorderTableModal params={reorderParams} onClose={() => setReorderParams(null)} />
      )}
    </div>
  );
}

// ─── Info modal ──────────────────────────────────────────────────────────────

function InfoModal({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-(--border) bg-(--surface)"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-(--surface) border-b border-(--border) px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent-cyan/10 flex items-center justify-center">
              <Info size={14} className="text-accent-cyan" aria-hidden="true" />
            </div>
            <h2 id="info-modal-title" className="text-base font-bold text-(--text)">Як працює аналіз даних</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити інформацію"
            className="w-8 h-8 rounded-lg border border-(--border) flex items-center justify-center text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-[12px] text-(--muted) leading-relaxed">

          {/* Section 1 — 30-day window */}
          <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan/80 mb-2">Захист від старих даних</div>
            <p className="text-(--text) mb-2">
              Агенти <strong>автоматично ігнорують старі дані</strong> — наприклад, дані минулого року або минулого сезону.
            </p>
            <p>
              Кожен агент при запуску обраховує вікна відносно поточного дня:
            </p>
            <div className="mt-2 space-y-1 font-mono text-[11px]">
              <div className="flex gap-3"><span className="text-accent-cyan">d7</span><span>= сьогодні − 7 днів → продажі за тиждень</span></div>
              <div className="flex gap-3"><span className="text-accent-cyan">d14</span><span>= сьогодні − 14 днів → попередній тиждень (для тренду)</span></div>
              <div className="flex gap-3"><span className="text-accent-cyan">d30</span><span>= сьогодні − 30 днів → місячна швидкість продажів</span></div>
            </div>
            <p className="mt-2">
              Навіть якщо в базі є записи за попередні роки — агент їх <strong>не бачить</strong>, бо фільтр <span className="font-mono bg-(--input-bg) px-1 rounded-sm">date ≥ d30</span> відсікає все старіше 30 днів. Це стандартна поведінка, коли поле «від» не заповнене.
            </p>
          </div>

          {/* Section 2 — період даних (від/до) */}
          <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Період даних «від — до» (поля вище)</div>
            <p className="mb-2">
              <strong>«До» (дата аналізу)</strong> — агент запускається <strong>ніби зараз — ця дата</strong>. Наприклад, якщо обрати 1 травня — агент вважатиме що "сьогодні" 1 травня і порахує всі вікна відносно неї.
            </p>
            <p className="mb-2">
              <strong>«Від» (початок вікна)</strong> — необовʼязкове. Якщо заповнене, агенти беруть дані <strong>тільки в межах періоду «від — до»</strong>, і розрахунок змінюється:
            </p>
            <div className="mb-2 space-y-1 font-mono text-[11px]">
              <div className="flex gap-3"><span className="text-accent-purple">Швидкість</span><span>= продажі за період ÷ днів у періоді (замість ÷30)</span></div>
              <div className="flex gap-3"><span className="text-accent-purple">WOH</span><span>= залишок ÷ швидкість за період</span></div>
              <div className="flex gap-3"><span className="text-accent-purple">Тренд</span><span>= друга половина періоду vs перша половина</span></div>
              <div className="flex gap-3"><span className="text-accent-purple">STR</span><span>= продажі за останні 7 днів періоду ÷ залишок</span></div>
            </div>
            <p>Корисно для:</p>
            <ul className="mt-1 space-y-1 list-none pl-0">
              <li className="flex gap-2"><span className="text-accent-cyan">→</span>Аналізу конкретного сезону: "тільки дані з 1 вересня" (старий сезон не змішується)</li>
              <li className="flex gap-2"><span className="text-accent-cyan">→</span>Ретроспективи: "який стан був 2 тижні тому?"</li>
              <li className="flex gap-2"><span className="text-accent-cyan">→</span>Перевірки: "чи правильно агент оцінив би ситуацію тоді?"</li>
            </ul>
          </div>

          {/* Section 3 — Caveats per block */}
          <div className="border border-(--border) rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-(--surface2) border-b border-(--border)">
              <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle)">Застереження при аналізі минулих дат</div>
            </div>
            <div className="divide-y divide-(--border)">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-cyan/10 text-accent-cyan">БЛОК 1–2</span>
                  <span className="text-(--text) font-semibold">Inventory, Channel, Attributes, Repricing, Reordering</span>
                </div>
                <p>Продажі — точні (беруться з реальних записів). Залишки на складі — <strong>ближній знімок до обраної дати</strong>. Якщо щоденні знімки не зберігались — будуть використані поточні залишки.</p>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-yellow/10 text-accent-yellow">БЛОК 3</span>
                  <span className="text-(--text) font-semibold">Commercial Marketer, Calendar Agent</span>
                </div>
                <p>Ці агенти генерують рекомендації <strong>на майбутнє</strong>: "запусти email сьогодні", "заплануй на наступний тиждень". При аналізі минулої дати рекомендації будуть датовані тим часом — <strong>не actionable</strong>, але корисні для ретроспективи.</p>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-[#fb923c]/10 text-[#fb923c]">БЛОК 4</span>
                  <span className="text-(--text) font-semibold">Campaign Analysis, Weekly Report</span>
                </div>
                <p>Читають збережені результати попередніх агентів з бази. Обрана дата <strong>майже не впливає</strong> на їх вивід — вони завжди аналізують останні збережені дані.</p>
              </div>
            </div>
          </div>

          {/* Section 4 — нюанси власного періоду */}
          <div className="bg-accent-purple/5 border border-accent-purple/20 rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-purple/80 mb-2">Нюанси власного періоду «від»</div>
            <ul className="space-y-1.5 list-none pl-0">
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Залишки на складі завжди беруться на дату <strong>«до»</strong> (найближчий знімок) — поле «від» на них не впливає.</li>
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Дуже короткий період (менше 7 днів) робить тренд і STR нестабільними — половини періоду занадто малі.</li>
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Дуже довгий період (90+ днів) усереднює швидкість продажів — WOH може виглядати краще/гірше за реальний поточний темп.</li>
              <li className="flex gap-2"><span className="text-accent-purple">·</span>Обраний період зберігається в кожному запуску агента — його видно у вікні «Трасування» (поля asOf і dateFrom).</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Debug / Trace modal ──────────────────────────────────────────────────────

function DebugModal({
  agentLabel,
  debug,
  runId,
  duration,
  onClose,
}: {
  agentLabel: string;
  debug: Record<string, any>;
  runId?: string;
  duration?: string | null;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parsedOk = debug.parsedSuccessfully !== false;
  const providerLabel = debug.provider === "openai" ? "OpenAI" : "Anthropic";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-modal-title"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-(--border) bg-(--surface)"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-(--surface) border-b border-(--border) px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-0.5">
              Трасування агента
            </div>
            <h2 id="debug-modal-title" className="text-base font-bold text-(--text)">{agentLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити трасування агента"
            className="w-8 h-8 rounded-lg border border-(--border) flex items-center justify-center text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Metadata */}
          <div className="bg-(--surface2) border border-(--border) rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-3">Метадані запуску</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Провайдер", value: providerLabel },
                { label: "Модель", value: debug.model ?? "—" },
                { label: "Парсинг JSON", value: parsedOk ? "✓ успішно" : "✗ fallback", color: parsedOk ? "#00e5c4" : "#fbbf24" },
                ...(duration ? [{ label: "Час роботи", value: duration }] : []),
                ...(debug.brandCount != null ? [{ label: "Брендів", value: String(debug.brandCount) }] : []),
                ...(debug.candidateCount != null ? [{ label: "Кандидатів", value: String(debug.candidateCount) }] : []),
                ...(debug.channelCount != null ? [{ label: "Каналів", value: String(debug.channelCount) }] : []),
                ...(debug.categoryCount != null ? [{ label: "Категорій", value: String(debug.categoryCount) }] : []),
                ...(debug.decisionCount != null ? [{ label: "Валідованих рекомендацій", value: String(debug.decisionCount) }] : []),
                ...(debug.campaignCount != null ? [{ label: "Кампаній", value: String(debug.campaignCount) }] : []),
                ...(debug.calendarEventCount != null ? [{ label: "Подій", value: String(debug.calendarEventCount) }] : []),
                ...(debug.agentsIncluded != null ? [{ label: "Агентів", value: String(debug.agentsIncluded) }] : []),
                ...(runId ? [{ label: "Run ID", value: runId.slice(0, 12) + "…" }] : []),
                ...(debug.asOf ? [{ label: "Дата аналізу", value: debug.asOf, color: "#fbbf24" }] : []),
                ...(debug.dateFrom ? [{ label: "Дані від", value: debug.dateFrom, color: "#a78bfa" }] : []),
                ...(debug.analyzedAt ? [{ label: "Час аналізу", value: new Date(debug.analyzedAt).toLocaleTimeString("uk-UA") }] : []),
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-(--row) rounded-lg px-3 py-2">
                  <div className="text-[9px] font-mono uppercase text-(--subtle)">{label}</div>
                  <div className="text-[11px] font-mono font-semibold mt-0.5" style={{ color: color ?? "var(--text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weeks analyzed (Calendar Agent) */}
          {Array.isArray(debug.weeksAnalyzed) && debug.weeksAnalyzed.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-mono text-(--subtle) uppercase tracking-wide">Тижні:</span>
              {debug.weeksAnalyzed.map((w: string) => (
                <span key={w} className="text-[9px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">{w}</span>
              ))}
            </div>
          )}

          {/* System Prompt */}
          {debug.systemPrompt && (
            <DebugSection
              title="Системний промт (роль + правила + схема JSON)"
              content={debug.systemPrompt}
              defaultOpen={false}
            />
          )}

          {/* User Prompt */}
          {debug.userPrompt && (
            <DebugSection
              title="Дані для аналізу (те що відправлено в AI)"
              content={debug.userPrompt}
              defaultOpen={true}
            />
          )}

          {/* Raw AI Response */}
          {debug.rawResponse && (
            <DebugSection
              title="Сирий відповідь AI (до парсингу JSON)"
              content={debug.rawResponse}
              defaultOpen={false}
            />
          )}

          {!parsedOk && (
            <div className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow/70 mb-1">Парсинг не вдався</div>
              <p className="text-[12px] text-(--muted)">
                AI повернув відповідь, але JSON не вдалося розпарсити. Використано fallback-вивід.
                Перевірте сирий відповідь вище.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Brand status card ────────────────────────────────────────────────────────

function BrandCard({ b }: { b: BrandResult }) {
  const [open, setOpen] = useState(false);
  const color = statusColor(b.status);

  return (
    <div className="border rounded-lg overflow-hidden" style={{ borderColor: color + "30" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/2 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-semibold text-(--text) text-sm">{b.brand_name}</span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm"
            style={{ background: color + "18", color }}
          >
            {statusLabel(b.status)}
          </span>
          {b.urgency === "immediate" && (
            <span className="text-[10px] font-mono text-[#ef4444]">● негайно</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {b.metrics && (
            <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono text-(--muted)">
              <span>WOH <span className="text-(--text)">{formatWohDays(b.metrics.wohDays)}</span></span>
              <span>STR <span className="text-(--text)">{b.metrics.strPercent}%</span></span>
              <span>
                {b.metrics.trend7dPct > 0 ? (
                  <TrendingUp size={11} className="inline text-[#86efac]" aria-hidden="true" />
                ) : b.metrics.trend7dPct < 0 ? (
                  <TrendingDown size={11} className="inline text-[#fca5a5]" aria-hidden="true" />
                ) : (
                  <Minus size={11} className="inline text-(--subtle)" aria-hidden="true" />
                )}
                {" "}{b.metrics.trend7dPct > 0 ? "+" : ""}{b.metrics.trend7dPct}%
              </span>
            </div>
          )}
          {open ? <ChevronUp size={14} className="text-(--subtle)" aria-hidden="true" /> : <ChevronDown size={14} className="text-(--subtle)" aria-hidden="true" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-(--border-faint)">
          <p className="text-sm text-(--muted) mt-3">{b.analysis}</p>
          {b.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {[
                { label: "Склад", value: b.metrics.totalStock + " шт" },
                { label: "Продаж 7д", value: b.metrics.salesLast7d + " шт" },
                { label: "Продаж 30д", value: b.metrics.salesLast30d + " шт" },
                { label: "GM", value: b.metrics.gmPercent + "%" },
              ].map((item) => (
                <div key={item.label} className="bg-(--row) rounded-lg px-3 py-2">
                  <div className="text-[9px] font-mono uppercase text-(--subtle)">{item.label}</div>
                  <div className="text-sm font-mono font-semibold text-(--text) mt-0.5">{item.value}</div>
                </div>
              ))}
            </div>
          )}
          {b.suggested_actions?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-[10px] text-(--subtle)">Дії:</span>
              {b.suggested_actions.map((a) => (
                <span key={a} className="text-[10px] font-mono px-2 py-0.5 bg-(--input-bg) border border-(--border) rounded-sm text-(--muted)">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
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
  const Icon = agent.icon;
  const isStale = run?.isCurrent === false;
  const s = isStale ? "idle" : (run?.status ?? "idle");
  const output = isStale ? {} : (run?.output ?? {});

  // Inventory analyst
  // Only inventory_analyst returns BrandResult[] — repricing/reordering also use output.brands
  // but with a different shape; keep them separate to avoid BrandCard crash on missing fields
  const brands: BrandResult[] = agent.id === "inventory_analyst" ? (output.brands ?? []) : [];
  const criticalCount = brands.filter((b) => b.status === "critical").length;
  const warningCount = brands.filter((b) => b.status === "warning").length;

  // Channel analytics
  const channels: any[] = output.channels ?? output.metrics?.channels ?? [];
  const topChannel: string = output.top_channel ?? "";

  // Product attributes
  const byCategory: any[] = output.by_category ?? output.metrics?.byCategory ?? [];
  const bestsellers: string[] = output.bestsellers ?? output.metrics?.topCategories ?? [];
  const deadStock: string[] = output.dead_stock ?? output.metrics?.deadCategories ?? [];

  // Repricing / Reordering (Block 2) — both return output.brands
  const decisionBrands: any[] = agent.id === "repricing" || agent.id === "reordering"
    ? (output.brands ?? [])
    : [];
  const recommendedCount = decisionBrands.filter((b: any) => {
    const items: any[] = b.options ?? b.scenarios ?? [];
    return items.some((i: any) => i.evaluation?.recommended);
  }).length;

  // Commercial Marketer
  const marketerBrands: any[] = agent.id === "commercial_marketer" ? (output.brands ?? []) : [];

  // Calendar Agent
  const annotations: any[] = agent.id === "calendar_agent" ? (output.annotations ?? []) : [];
  const planningRecommendations: ApprovalRecommendation[] = agent.id === "calendar_agent"
    ? (output.planning_recommendations ?? [])
    : [];
  const healthScore: any = output.health_score ?? null;
  const criticalAnnotations = annotations.filter((a: any) => a.priority === "critical").length;

  // Campaign Analysis
  const campaigns: any[] = agent.id === "campaign_analysis" ? (output.campaigns ?? []) : [];
  const campaignOverallHealth: string = output.overall_health ?? "";
  const campaignsBehind = campaigns.filter((c: any) => c.status === "behind" || c.status === "stalled").length;
  const activeCampaignCount = output.active_campaign_count ?? campaigns.length;
  const scheduledCampaignCount = output.scheduled_campaign_count ?? campaigns.length;
  const pendingRecommendations = output.pending_recommendations ?? 0;

  // Weekly Report
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
      className="bg-(--surface2) border border-(--border) rounded-xl overflow-hidden"
      style={{ borderLeft: `3px solid ${agent.color}` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: agent.color + "15" }}
            >
              <Icon size={15} style={{ color: agent.color }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-(--text)">{agent.label}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-(--input-bg) text-(--subtle)">
                  {agent.model}
                </span>
                {agent.model !== "Rules v1" && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-(--input-bg) text-(--subtle)">
                    {provider === "openai" ? "OpenAI" : "Anthropic"}
                  </span>
                )}
                {!AGENT_ROUTES[agent.id] && (
                  <span className="text-[9px] font-mono text-(--subtle)">• скоро</span>
                )}
              </div>
              <p className="text-[11px] text-(--muted) mt-0.5">{agent.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {agentStatusIcon(s)}
            <button
              type="button"
              onClick={onRun}
              disabled={s === "running" || !dependenciesReady}
              title={!dependenciesReady ? "Спочатку завершіть залежні агенти для поточного періоду" : undefined}
              aria-label={`${s === "running" ? "Агент працює" : "Запустити агента"} ${agent.label}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: agent.color + "18",
                border: `1px solid ${agent.color}40`,
                color: agent.color,
              }}
            >
              {s === "running" ? (
                <RefreshCw size={11} className="animate-spin" aria-hidden="true" />
              ) : (
                <Play size={11} aria-hidden="true" />
              )}
              {s === "running" ? "Працює…" : !dependenciesReady ? "Очікує дані" : "Запустити"}
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-(--subtle)">
          <span>
            Статус:{" "}
            <span
              className={
                s === "done"
                  ? "text-accent-cyan"
                  : s === "running"
                    ? "text-accent-yellow"
                    : s === "error"
                      ? "text-[#ef4444]"
                      : "text-(--subtle)"
              }
            >
              {isStale ? "застаріло" : s === "idle" ? "очікування" : s === "running" ? "працює" : s === "done" ? "готово" : "помилка"}
            </span>
          </span>
          {run?.finishedAt && (
            <span>Останній запуск: <span className="text-(--muted)">{fmtDate(run.finishedAt)}</span></span>
          )}
          {duration(run) && (
            <span>Час: <span className="text-(--muted)">{duration(run)}</span></span>
          )}
        </div>

        {/* Summary badges — Inventory Analyst */}
        {s === "done" && brands.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {criticalCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {criticalCount} критичних
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">
                {warningCount} попереджень
              </span>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan">
                Все гаразд
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : `Детально (${brands.length} брендів) ↓`}
            </button>
          </div>
        )}

        {/* Summary badges — Channel Analytics */}
        {s === "done" && channels.length > 0 && brands.length === 0 && byCategory.length === 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {topChannel && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan">
                Лідер за кількістю: {topChannel}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-(--input-bg) border border-(--border) text-(--muted)">
              {channels.length} каналів
            </span>
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Product Attributes */}
        {s === "done" && byCategory.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {bestsellers.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan">
                Бестселери: {bestsellers.slice(0, 2).join(", ")}
              </span>
            )}
            {deadStock.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                Dead stock: {deadStock.length} категорій
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : `Детально (${byCategory.length} категорій) ↓`}
            </button>
          </div>
        )}

        {/* Summary badges — Repricing / Reordering */}
        {s === "done" && decisionBrands.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-purple/10 border border-accent-purple/20 text-accent-purple">
              {decisionBrands.length} {agent.id === "repricing" ? "брендів до уцінки" : "брендів до дозамовлення"}
            </span>
            {recommendedCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan">
                {recommendedCount} рекомендацій готово
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Commercial Marketer */}
        {s === "done" && marketerBrands.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">
              {marketerBrands.length} брифів готово
            </span>
            {marketerBrands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {marketerBrands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").length} термінових
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Calendar Agent */}
        {s === "done" && (annotations.length > 0 || healthScore) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {healthScore?.coverage_percent != null && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">
                Покриття: {healthScore.coverage_percent}%
              </span>
            )}
            {healthScore?.recommendation_count != null && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-(--input-bg) border border-(--border) text-(--muted)">
                {healthScore.scheduled_recommendations ?? 0} заплановано / {healthScore.recommendation_count} рекомендовано
              </span>
            )}
            {criticalAnnotations > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {criticalAnnotations} критичних прогалин
              </span>
            )}
            {annotations.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-(--input-bg) border border-(--border) text-(--muted)">
                {annotations.length} анотацій
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Campaign Analysis */}
        {s === "done" && agent.id === "campaign_analysis" && campaignOverallHealth && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {campaignOverallHealth && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border ${campaignHealthClasses(campaignOverallHealth)}`}>
                {campaignHealthLabel(campaignOverallHealth)}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-(--input-bg) border border-(--border) text-(--muted)">
              {activeCampaignCount} активних
            </span>
            {scheduledCampaignCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-(--input-bg) border border-(--border) text-(--muted)">
                {scheduledCampaignCount} у календарі
              </span>
            )}
            {pendingRecommendations > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">
                {pendingRecommendations} очікують погодження
              </span>
            )}
            {campaignsBehind > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {campaignsBehind} відстають
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Weekly Report */}
        {s === "done" && isWeeklyReport && (output.pm_brief || output.summary) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {output.week && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-[#fb923c]/10 border border-[#fb923c]/20 text-[#fb923c]">
                {output.week}
              </span>
            )}
            {weeklyPriorities.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-(--input-bg) border border-(--border) text-(--muted)">
                {weeklyPriorities.length} пріоритетів
              </span>
            )}
            {weeklyDecisions.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-accent-yellow/10 border border-accent-yellow/20 text-accent-yellow">
                {weeklyDecisions.length} рішень PM
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-(--muted) hover:text-(--text) ml-auto">
              {expanded ? "Згорнути ↑" : "Показати звіт ↓"}
            </button>
          </div>
        )}

        {/* Error */}
        {s === "error" && run?.errorMsg && (
          <p className="mt-2 text-[11px] text-[#ef4444] font-mono">{run.errorMsg}</p>
        )}

        {/* No data message */}
        {s === "done" && brands.length === 0 && decisionBrands.length === 0 && marketerBrands.length === 0 && annotations.length === 0 && campaigns.length === 0 && !isWeeklyReport && run?.output?.message && (
          <p className="mt-2 text-[11px] text-(--muted)">{run.output.message}</p>
        )}
        {s === "done" && isWeeklyReport && !output.pm_brief && run?.output?.message && (
          <p className="mt-2 text-[11px] text-(--muted)">{run.output.message}</p>
        )}

        {/* Action buttons row */}
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

      {/* Expanded — Inventory Analyst */}
      {expanded && brands.length > 0 && (
        <div className="border-t border-(--border) px-4 py-3 space-y-2">
          {brands.map((b) => (
            <BrandCard key={b.brand_id} b={b} />
          ))}
        </div>
      )}

      {/* Expanded — Channel Analytics */}
      {expanded && channels.length > 0 && brands.length === 0 && (
        <div className="border-t border-(--border) px-4 py-3 space-y-2">
          {output.summary && (
            <p className="text-sm text-(--muted) pb-2">{output.summary}</p>
          )}
          {channels.map((ch: any, i: number) => (
            <div key={i} className="bg-(--row) rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-(--text) capitalize">{ch.channel}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  ch.status === "best" ? "bg-accent-cyan/10 text-accent-cyan" :
                  ch.status === "weak" || ch.status === "inactive" ? "bg-accent-yellow/10 text-accent-yellow" :
                  "bg-(--input-bg) text-(--muted)"
                }`}>
                  {ch.status?.toUpperCase()}
                </span>
              </div>
              {ch.insight && <p className="text-[11px] text-(--muted)">{ch.insight}</p>}
              {ch.recommendation && (
                <p className="text-[11px] text-accent-cyan mt-1">→ {ch.recommendation}</p>
              )}
            </div>
          ))}
          {output.action && (
            <div className="mt-2 px-3 py-2 bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg">
              <span className="text-[10px] font-mono text-(--subtle)">Дія: </span>
              <span className="text-[11px] text-accent-cyan">{output.action}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — Product Attributes */}
      {expanded && byCategory.length > 0 && (
        <div className="border-t border-(--border) px-4 py-3 space-y-2">
          {output.summary && (
            <p className="text-sm text-(--muted) pb-2">{output.summary}</p>
          )}
          {byCategory.map((cat: any, i: number) => (
            <div key={i} className="bg-(--row) rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-(--text)">{cat.category || cat.attribute}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  cat.status === "bestseller" ? "bg-accent-cyan/10 text-accent-cyan" :
                  cat.status === "dead" ? "bg-[#ef4444]/10 text-[#ef4444]" :
                  cat.status === "slow" ? "bg-accent-yellow/10 text-accent-yellow" :
                  "bg-(--input-bg) text-(--muted)"
                }`}>
                  {(cat.status || "normal").toUpperCase()}
                </span>
              </div>
              {cat.insight && <p className="text-[11px] text-(--muted)">{cat.insight}</p>}
              {cat.recommendation && (
                <p className="text-[11px] text-accent-cyan mt-1">→ {cat.recommendation}</p>
              )}
            </div>
          ))}
          {output.action && (
            <div className="mt-2 px-3 py-2 bg-accent-cyan/5 border border-accent-cyan/20 rounded-lg">
              <span className="text-[10px] font-mono text-(--subtle)">Дія: </span>
              <span className="text-[11px] text-accent-cyan">{output.action}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — Repricing / Reordering */}
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
                        style={{ background: isRec ? "#00e5c4" + "07" : undefined }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm" style={{
                            background: agent.color + "20", color: agent.color,
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
                            Оцінка: <span style={{ color: score >= 7 ? "#00e5c4" : score >= 5 ? "#fbbf24" : "#ef4444" }}>
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
                            style={{ borderColor: "#a78bfa40", background: "#a78bfa12", color: "#a78bfa" }}
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
                            style={{ borderColor: "#a78bfa40", background: "#a78bfa12", color: "#a78bfa" }}
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

      {/* Expanded — Commercial Marketer */}
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
                  brand.urgency === "critical" ? "bg-[#ef4444]/10 text-[#ef4444]" :
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

      {/* Expanded — Calendar Agent */}
      {expanded && (annotations.length > 0 || healthScore) && (
        <div className="border-t border-(--border) px-4 py-4 space-y-3">
          {healthScore?.summary && <p className="text-sm text-(--muted)">{healthScore.summary}</p>}
          {output.summary && output.summary !== healthScore?.summary && (
            <p className="text-sm text-(--muted)">{output.summary}</p>
          )}
          {annotations.map((ann: any, i: number) => {
            const prioColor = ann.priority === "critical" ? "#ef4444" : ann.priority === "high" ? "#fbbf24" : ann.priority === "medium" ? "#a78bfa" : "#6b7a8d";
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

      {/* Expanded — Campaign Analysis */}
      {expanded && agent.id === "campaign_analysis" && (campaigns.length > 0 || output.summary) && (
        <div className="border-t border-(--border) px-4 py-4 space-y-3">
          {output.summary && <p className="text-sm text-(--muted)">{output.summary}</p>}
          {campaigns.map((camp: any, i: number) => {
            const statusColor = campaignStatusColor(camp.status);
            return (
              <div key={camp.campaign_id ?? i} className="border border-(--border) rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-semibold text-sm text-(--text)">{camp.brand_name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm" style={{ background: statusColor + "20", color: statusColor, border: `1px solid ${statusColor}30` }}>
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

      {/* Expanded — Weekly Report */}
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
                    <span className="text-[11px] font-mono font-bold text-[#fb923c] w-5 shrink-0">#{p.rank}</span>
                    <div className="min-w-0">
                      <span className="text-[11px] text-(--text)">{p.action}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.brand && p.brand !== "все" && <span className="text-[9px] font-mono text-(--subtle)">{p.brand}</span>}
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-sm ${p.deadline === "today" ? "bg-[#ef4444]/10 text-[#ef4444]" : p.deadline === "tomorrow" ? "bg-accent-yellow/10 text-accent-yellow" : "bg-(--input-bg) text-(--muted)"}`}>
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
              <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow/70 mb-2">Рішення PM</div>
              <ul className="space-y-1">
                {weeklyDecisions.map((d: string, i: number) => (
                  <li key={i} className="text-[11px] text-(--text)">· {d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Full analysis modal */}
      {showModal && run?.output && (
        <AnalysisModal
          agentId={agent.id}
          agentLabel={agent.label}
          output={run.output}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Debug / trace modal */}
      {showDebug && run?.output?._debug && (
        <DebugModal
          agentLabel={agent.label}
          debug={run.output._debug}
          runId={run.id}
          duration={duration(run)}
          onClose={() => setShowDebug(false)}
        />
      )}

      {/* Promo simulation table (Repricing) */}
      {simParams && (
        <PromoTableModal params={simParams} onClose={() => setSimParams(null)} />
      )}

      {/* Reorder simulation table (Reordering) */}
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

// ─── Pipeline diagram ─────────────────────────────────────────────────────────

function PipelineDiagram({ runs }: { runs: Record<string, AgentRunInfo> }) {
  return (
    <div className="bg-(--surface) border border-(--border) rounded-xl p-5 mb-6 overflow-x-auto">
      <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-4">Пайплайн агентів</div>
      <div className="flex items-start gap-2 min-w-max">
        {BLOCKS.map((block, bi) => {
          const blockAgents = AGENTS.filter((a) => a.block === block.id);
          return (
            <div key={block.id} className="flex items-center gap-2">
              {/* Block */}
              <div className="flex flex-col gap-1.5">
                <div
                  className="text-[9px] font-mono uppercase tracking-wider mb-1 px-1"
                  style={{ color: block.color }}
                >
                  {block.label}
                </div>
                {blockAgents.map((agent) => {
                  const run = runs[agent.id];
                  const s = run?.isCurrent === false ? "idle" : (run?.status ?? "idle");
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-mono whitespace-nowrap"
                      style={{
                        borderColor: agent.color + "40",
                        background:
                          s === "done"
                            ? agent.color + "10"
                            : s === "running"
                              ? "#fbbf2415"
                              : s === "error"
                                ? "#ef444415"
                                : "var(--surface2)",
                        color:
                          s === "done"
                            ? agent.color
                            : s === "running"
                              ? "#fbbf24"
                              : s === "error"
                                ? "#ef4444"
                                : "var(--muted)",
                      }}
                    >
                      {agentStatusIcon(s)}
                      <span>{agent.label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Arrow between blocks */}
              {bi < BLOCKS.length - 1 && (
                <div className="flex items-center self-center pb-1">
                  <div className="w-6 h-px bg-(--border)" />
                  <div
                    className="w-0 h-0"
                    style={{
                      borderTop: "4px solid transparent",
                      borderBottom: "4px solid transparent",
                      borderLeft: "6px solid var(--border)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [analysisDate, setAnalysisDate] = useState(todayStr);
  const [dateFrom, setDateFrom] = useState(""); // "" = стандартне вікно 30 днів
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
      // Continue with the default period when browser storage is unavailable.
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
      // Private browsing or storage policies must not break the agents page.
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
  // "Від" має бути щонайменше на день раніше за "До"
  const maxFromStr = new Date(new Date(analysisDate).getTime() - 86400000).toISOString().slice(0, 10);
  const periodDays = hasDateFrom
    ? Math.max(1, Math.round((new Date(analysisDate).getTime() - new Date(dateFrom).getTime()) / 86400000))
    : 30;

  const totalDone = Object.values(runs).filter((r) => r.status === "done").length;
  const totalError = Object.values(runs).filter((r) => r.status === "error").length;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] font-mono uppercase tracking-widest text-(--subtle) mb-2">AI Pipeline</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-(--text)">Агенти</h1>
            <p className="text-sm text-(--muted) mt-0.5">
              9 агентів · {totalDone} виконано
              {totalError > 0 && <span className="text-[#ef4444] ml-2">· {totalError} помилок</span>}
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
              className="p-1.5 rounded-lg border border-(--border) text-(--muted) hover:text-(--text) hover:bg-(--input-bg) transition-colors"
              title="Оновити статус"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {statusError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 text-xs text-[#ef4444]">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{statusError}</span>
        </div>
      )}

      {/* Date range picker */}
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
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-(--border) bg-(--input-bg) text-(--text) focus:outline-hidden focus:border-accent-cyan/50"
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
                // якщо "до" стала раніше за "від" — скидаємо "від"
                if (dateFrom && v <= dateFrom) setDateFrom("");
              }}
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-(--border) bg-(--input-bg) text-(--text) focus:outline-hidden focus:border-accent-cyan/50"
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

        {/* Warning for custom period */}
        {hasDateFrom && (
          <div className="mt-3 flex items-start gap-2 bg-accent-purple/5 border border-accent-purple/20 rounded-lg px-3 py-2.5">
            <Info size={12} className="text-accent-purple shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-(--muted) leading-relaxed">
              <span className="text-accent-purple font-semibold">Власний період ({periodDays} дн.):</span> швидкість продажів і WOH рахуються за весь період <span className="text-(--text)">{dateFrom} — {analysisDate}</span> замість стандартних 30 днів. Тренд = друга половина періоду проти першої. Дані раніше дати «від» агенти не бачать.
            </p>
          </div>
        )}

        {/* Warnings for historical date */}
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

      {/* Pipeline diagram */}
      <PipelineDiagram runs={runs} />

      {/* Agent cards grouped by block */}
      <div className="space-y-6">
        {BLOCKS.map((block) => {
          const blockAgents = AGENTS.filter((a) => a.block === block.id);
          return (
            <div key={block.id}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-(--border)" />
                <div
                  className="text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded-full border"
                  style={{ color: block.color, borderColor: block.color + "40", background: block.color + "10" }}
                >
                  Блок {block.id} — {block.label}
                </div>
                <div className="text-[9px] font-mono text-(--subtle)">{block.desc}</div>
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
            </div>
          );
        })}
      </div>

      {/* Info modal */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {/* Legend */}
      <div className="mt-8 pt-4 border-t border-(--border) flex items-center gap-6 flex-wrap">
        {[
          { color: "var(--subtle)", label: "Очікування" },
          { color: "#fbbf24", label: "Працює" },
          { color: "#00e5c4", label: "Готово" },
          { color: "#ef4444", label: "Помилка" },
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
