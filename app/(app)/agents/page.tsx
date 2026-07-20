"use client";

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
import { buildReorderParams, buildSimParams, duration, fmt, fmtDate, statusColor, statusLabel } from "@/components/agents/agents.utils";
import DebugSection from "@/components/agents/DebugSection";
import { useAgentRuns } from "@/components/agents/useAgentRuns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agentStatusIcon(s: AgentStatus) {
  if (s === "running") return <RefreshCw size={12} className="animate-spin text-[#fbbf24]" aria-hidden="true" />;
  if (s === "done") return <CheckCircle2 size={12} className="text-[#00e5c4]" aria-hidden="true" />;
  if (s === "error") return <AlertTriangle size={12} className="text-[#ef4444]" aria-hidden="true" />;
  return <Clock size={12} className="text-[var(--subtle)]" aria-hidden="true" />;
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
        className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-2 flex-shrink-0"
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
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-0.5">
              Повний аналіз
            </div>
            <h2 id="analysis-modal-title" className="text-base font-bold text-[var(--text)]">{agentLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити повний аналіз"
            className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Summary */}
          {output.summary && (
            <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">
                Загальний висновок
              </div>
              <p className="text-sm text-[var(--text)] leading-relaxed">{output.summary}</p>
            </div>
          )}

          {/* Action */}
          {output.action && (
            <div className="bg-[#00e5c4]/5 border border-[#00e5c4]/20 rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#00e5c4]/70 mb-2">
                Головна дія
              </div>
              <p className="text-sm text-[#00e5c4] font-medium leading-relaxed">{output.action}</p>
            </div>
          )}

          {/* Inventory Analyst — brands */}
          {agentId === "inventory_analyst" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">
                Аналіз по брендах ({output.brands.length})
              </div>
              <div className="space-y-3">
                {output.brands.map((b: any) => (
                  <div key={b.brand_id ?? b.brand_name} className="border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-[var(--text)]">{b.brand_name}</span>
                      {statusBadge(b.status, brandColors)}
                    </div>
                    {b.analysis && (
                      <p className="text-[12px] text-[var(--muted)] leading-relaxed mb-2">{b.analysis}</p>
                    )}
                    {Array.isArray(b.suggested_actions) && b.suggested_actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {b.suggested_actions.map((a: string) => (
                          <span key={a} className="text-[10px] font-mono px-2 py-0.5 bg-[var(--row)] border border-[var(--border)] rounded text-[var(--muted)]">
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
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">
                Аналіз по каналах ({output.channels.length})
              </div>
              <div className="space-y-3">
                {output.channels.map((c: any, i: number) => (
                  <div key={i} className="border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-[var(--text)] capitalize">{c.channel}</span>
                      {statusBadge(c.status, channelColors)}
                    </div>
                    {c.insight && (
                      <p className="text-[12px] text-[var(--muted)] leading-relaxed mb-2">{c.insight}</p>
                    )}
                    {c.recommendation && (
                      <p className="text-[12px] text-[#00e5c4]">→ {c.recommendation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Attributes — categories */}
          {agentId === "product_attributes" && Array.isArray(output.by_category) && output.by_category.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">
                Аналіз по категоріях ({output.by_category.length})
              </div>
              <div className="space-y-3">
                {output.by_category.map((c: any, i: number) => (
                  <div key={i} className="border border-[var(--border)] rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-[var(--text)]">{c.category || c.attribute}</span>
                      {statusBadge(c.status, catColors)}
                    </div>
                    {c.insight && (
                      <p className="text-[12px] text-[var(--muted)] leading-relaxed mb-2">{c.insight}</p>
                    )}
                    {c.recommendation && (
                      <p className="text-[12px] text-[#00e5c4]">→ {c.recommendation}</p>
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
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Бестселери</div>
                  <div className="flex flex-wrap gap-1.5">
                    {output.bestsellers.map((b: string) => (
                      <span key={b} className="text-[10px] font-mono px-2 py-0.5 bg-[#00e5c4]/10 border border-[#00e5c4]/20 rounded text-[#00e5c4]">{b}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(output.dead_stock) && output.dead_stock.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Dead Stock</div>
                  <div className="flex flex-wrap gap-1.5">
                    {output.dead_stock.map((d: string) => (
                      <span key={d} className="text-[10px] font-mono px-2 py-0.5 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded text-[#ef4444]">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Repricing — options per brand */}
          {agentId === "repricing" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div className="space-y-5">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)]">
                Стратегії уцінки ({output.brands.length} брендів)
              </div>
              {output.brands.map((brand: any) => (
                <div key={brand.brand_id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-[#a78bfa]/5 border-b border-[var(--border)]">
                    <span className="font-semibold text-sm text-[var(--text)]">{brand.brand_name}</span>
                    {brand.current_situation && (
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">{brand.current_situation}</p>
                    )}
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {(brand.options ?? []).map((opt: any) => (
                      <div key={opt.option_id} className="px-4 py-4" style={{ background: opt.evaluation?.recommended ? "#00e5c4" + "07" : undefined }}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#a78bfa]/15 text-[#a78bfa]">{opt.strategy_type}</span>
                          <span className="font-semibold text-sm text-[var(--text)]">{opt.label}</span>
                          {opt.evaluation?.recommended && (
                            <span className="text-[9px] font-mono text-[#00e5c4] ml-auto">★ РЕКОМЕНДОВАНО · {opt.evaluation.score}/10</span>
                          )}
                          {!opt.evaluation?.recommended && opt.evaluation?.score && (
                            <span className="text-[9px] font-mono text-[var(--subtle)] ml-auto">{opt.evaluation.score}/10</span>
                          )}
                        </div>
                        <div className="flex gap-4 text-[10px] font-mono text-[var(--muted)] mb-3 flex-wrap">
                          {opt.discount_percent > 0 && <span>Знижка <span className="text-[var(--text)]">-{opt.discount_percent}%</span></span>}
                          {opt.duration_days && <span>Строк <span className="text-[var(--text)]">{opt.duration_days}д</span></span>}
                          {opt.forecast?.woh_after != null && <span>WOH після <span className="text-[var(--text)]">{opt.forecast.woh_after}д</span></span>}
                          {opt.forecast?.margin_impact_percent != null && (
                            <span>Маржа <span className={opt.forecast.margin_impact_percent < 0 ? "text-[#fbbf24]" : "text-[#00e5c4]"}>
                              {opt.forecast.margin_impact_percent > 0 ? "+" : ""}{opt.forecast.margin_impact_percent}%
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
                              <li key={i} className="text-[11px] text-[var(--muted)]">− {c}</li>
                            ))}
                          </ul>
                        )}
                        {opt.evaluation?.risks?.length > 0 && (
                          <ul className="space-y-0.5">
                            {opt.evaluation.risks.map((r: string, i: number) => (
                              <li key={i} className="text-[11px] text-[#fbbf24]">⚠ {r}</li>
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
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)]">
                Сценарії дозамовлення ({output.brands.length} брендів)
              </div>
              {output.brands.map((brand: any) => (
                <div key={brand.brand_id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-[#a78bfa]/5 border-b border-[var(--border)]">
                    <span className="font-semibold text-sm text-[var(--text)]">{brand.brand_name}</span>
                    {brand.current_situation && (
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">{brand.current_situation}</p>
                    )}
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {(brand.scenarios ?? []).map((sc: any) => {
                      const riskColor = sc.evaluation?.risk_level === "HIGH" ? "#ef4444" : sc.evaluation?.risk_level === "LOW" ? "#00e5c4" : "#fbbf24";
                      return (
                        <div key={sc.scenario_id} className="px-4 py-4" style={{ background: sc.evaluation?.recommended ? "#00e5c4" + "07" : undefined }}>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#a78bfa]/15 text-[#a78bfa]">{sc.type}</span>
                            <span className="font-semibold text-sm text-[var(--text)]">{sc.label}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded ml-1" style={{ background: riskColor + "20", color: riskColor }}>
                              {sc.evaluation?.risk_level} RISK
                            </span>
                            {sc.evaluation?.recommended && (
                              <span className="text-[9px] font-mono text-[#00e5c4] ml-auto">★ РЕКОМЕНДОВАНО · {sc.evaluation.score}/10</span>
                            )}
                            {!sc.evaluation?.recommended && sc.evaluation?.score && (
                              <span className="text-[9px] font-mono text-[var(--subtle)] ml-auto">{sc.evaluation.score}/10</span>
                            )}
                          </div>
                          <div className="flex gap-4 text-[10px] font-mono text-[var(--muted)] mb-3 flex-wrap">
                            {sc.qty_multiplier != null && <span>Обʼєм <span className="text-[var(--text)]">×{sc.qty_multiplier}</span></span>}
                            {sc.woh_after != null && <span>WOH після <span className="text-[var(--text)]">{sc.woh_after}д</span></span>}
                            {sc.logic && <span className="text-[var(--subtle)]">{sc.logic}</span>}
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
                                <li key={i} className="text-[11px] text-[#fbbf24]">⚠ {r}</li>
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
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)]">
                Маркетингові брифи ({output.brands.length} брендів)
              </div>
              {output.brands.map((brand: any) => (
                <div key={brand.brand_id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-[#fbbf24]/5 border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--text)]">{brand.brand_name}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${brand.urgency === "critical" ? "bg-[#ef4444]/10 text-[#ef4444]" : "bg-[#fbbf24]/10 text-[#fbbf24]"}`}>
                        {(brand.urgency ?? "").toUpperCase()}
                      </span>
                    </div>
                    {brand.decision_summary && <p className="text-[11px] text-[var(--muted)] mt-0.5">{brand.decision_summary}</p>}
                    {brand.key_message && <p className="text-[12px] text-[var(--text)] mt-1 italic">"{brand.key_message}"</p>}
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {Object.entries(brand.channels ?? {}).map(([ch, v]: [string, any]) => (
                      <div key={ch} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fbbf24]/15 text-[#fbbf24] uppercase">{ch}</span>
                          {!v?.action_needed && <span className="text-[9px] font-mono text-[var(--subtle)]">не потрібно</span>}
                          {v?.priority && <span className="text-[9px] font-mono text-[var(--subtle)] ml-auto">пріоритет {v.priority}</span>}
                        </div>
                        {v?.brief && <p className="text-[12px] text-[var(--muted)] leading-relaxed">{v.brief}</p>}
                        {v?.frequency && <p className="text-[11px] text-[var(--text)] mt-1">📅 {v.frequency}</p>}
                        {v?.send_timing && <p className="text-[11px] text-[var(--text)] mt-1">📤 Відправити: {v.send_timing}</p>}
                        {v?.cta && <p className="text-[11px] text-[#00e5c4] mt-1">CTA: {v.cta}</p>}
                        {v?.budget_recommendation && <p className="text-[11px] text-[#00e5c4] mt-1">💰 {v.budget_recommendation}</p>}
                        {v?.staff_talking_points && <p className="text-[11px] text-[var(--muted)] mt-1 italic">"{v.staff_talking_points}"</p>}
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
                <div className={`border rounded-xl p-4 ${output.overall_health === "on_track" ? "bg-[#00e5c4]/5 border-[#00e5c4]/20" : output.overall_health === "critical" ? "bg-[#ef4444]/5 border-[#ef4444]/20" : "bg-[#fbbf24]/5 border-[#fbbf24]/20"}`}>
                  <div className="text-[9px] font-mono uppercase tracking-widest mb-1" style={{ color: output.overall_health === "on_track" ? "#00e5c4" : output.overall_health === "critical" ? "#ef4444" : "#fbbf24" }}>
                    Загальний стан кампаній
                  </div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    {output.overall_health === "on_track" ? "На правильному шляху" : output.overall_health === "critical" ? "Критичний стан" : "Потребує уваги"}
                  </p>
                  {output.summary && <p className="text-[12px] text-[var(--muted)] mt-1">{output.summary}</p>}
                </div>
              )}
              {Array.isArray(output.campaigns) && output.campaigns.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">Кампанії ({output.campaigns.length})</div>
                  <div className="space-y-3">
                    {output.campaigns.map((camp: any, i: number) => {
                      const sc = camp.status === "ahead" ? "#00e5c4" : camp.status === "on_track" ? "#86efac" : camp.status === "behind" ? "#fbbf24" : "#ef4444";
                      return (
                        <div key={camp.campaign_id ?? i} className="border border-[var(--border)] rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-semibold text-sm text-[var(--text)]">{camp.brand_name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: sc + "20", color: sc, border: `1px solid ${sc}30` }}>{camp.status?.toUpperCase()}</span>
                            <span className="text-[9px] font-mono text-[var(--subtle)] ml-auto">{camp.days_running ?? 0}д · {camp.performance_score ?? 0}/10</span>
                          </div>
                          {camp.planned_action && <p className="text-[11px] text-[var(--subtle)] mb-1">📋 {camp.planned_action}</p>}
                          {camp.actual_observation && <p className="text-[12px] text-[var(--muted)] mb-2">{camp.actual_observation}</p>}
                          {camp.next_action && <p className="text-[11px] text-[#00e5c4]">→ {camp.next_action}</p>}
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
                <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">PM Brief</div>
                  <p className="text-sm text-[var(--text)] leading-relaxed">{output.pm_brief}</p>
                </div>
              )}
              {output.marketing_brief && (
                <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Marketing Brief</div>
                  <p className="text-sm text-[var(--text)] leading-relaxed">{output.marketing_brief}</p>
                </div>
              )}
              {Array.isArray(output.top_priorities) && output.top_priorities.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">Топ пріоритети</div>
                  <div className="space-y-2">
                    {output.top_priorities.map((p: any) => (
                      <div key={p.rank} className="flex items-start gap-3 border border-[var(--border)] rounded-xl p-3">
                        <span className="text-base font-bold text-[#fb923c] w-6 flex-shrink-0">#{p.rank}</span>
                        <div className="min-w-0">
                          <p className="text-[12px] text-[var(--text)]">{p.action}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {p.brand && p.brand !== "все" && <span className="text-[10px] font-mono text-[var(--subtle)]">{p.brand}</span>}
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${p.deadline === "today" ? "bg-[#ef4444]/10 text-[#ef4444]" : p.deadline === "tomorrow" ? "bg-[#fbbf24]/10 text-[#fbbf24]" : "bg-[var(--input-bg)] text-[var(--muted)]"}`}>
                              {p.deadline}
                            </span>
                            {p.type && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fb923c]/10 text-[#fb923c]">{p.type}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(output.decisions_needed) && output.decisions_needed.length > 0 && (
                <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[#fbbf24]/70 mb-2">Рішення PM</div>
                  <ul className="space-y-1.5">
                    {output.decisions_needed.map((d: string, i: number) => (
                      <li key={i} className="text-[12px] text-[var(--text)]">· {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(output.wins) && output.wins.length > 0 && (
                <div className="bg-[#00e5c4]/5 border border-[#00e5c4]/20 rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[#00e5c4]/70 mb-2">Перемоги тижня</div>
                  <ul className="space-y-1.5">
                    {output.wins.map((w: string, i: number) => (
                      <li key={i} className="text-[12px] text-[var(--text)]">✓ {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {output.next_week_focus && (
                <div className="border border-[var(--border)] rounded-xl p-3">
                  <span className="text-[9px] font-mono text-[var(--subtle)] uppercase tracking-wide">Фокус наст. тижня: </span>
                  <span className="text-[12px] text-[var(--text)]">{output.next_week_focus}</span>
                </div>
              )}
            </div>
          )}

          {/* Calendar Agent — annotations */}
          {agentId === "calendar_agent" && (
            <div className="space-y-3">
              {output.health_score && (
                <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Здоровʼя плану</div>
                  <div className="flex items-center gap-4 text-[12px] font-mono flex-wrap">
                    <span>Coverage: <span className={output.health_score.coverage_percent >= 70 ? "text-[#00e5c4]" : "text-[#fbbf24]"}>{output.health_score.coverage_percent}%</span></span>
                    {output.health_score.critical_gaps > 0 && <span>Критичних: <span className="text-[#ef4444]">{output.health_score.critical_gaps}</span></span>}
                    {output.health_score.high_gaps > 0 && <span>Важливих: <span className="text-[#fbbf24]">{output.health_score.high_gaps}</span></span>}
                  </div>
                  {output.health_score.summary && <p className="text-[12px] text-[var(--muted)] mt-2">{output.health_score.summary}</p>}
                </div>
              )}
              {Array.isArray(output.annotations) && output.annotations.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">
                    Анотації ({output.annotations.length})
                  </div>
                  <div className="space-y-2">
                    {output.annotations.map((ann: any, i: number) => {
                      const prioColor = ann.priority === "critical" ? "#ef4444" : ann.priority === "high" ? "#fbbf24" : ann.priority === "medium" ? "#a78bfa" : "#6b7a8d";
                      return (
                        <div key={ann.id ?? i} className="border border-[var(--border)] rounded-xl p-3" style={{ borderLeftColor: prioColor, borderLeftWidth: 3 }}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[9px] font-mono uppercase font-bold" style={{ color: prioColor }}>{ann.type}</span>
                            {ann.channel && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fbbf24]/15 text-[#fbbf24]">{ann.channel}</span>}
                            {ann.brand && <span className="text-[9px] font-mono text-[var(--subtle)]">{ann.brand}</span>}
                            <span className="text-[9px] font-mono ml-auto" style={{ color: prioColor }}>{ann.priority?.toUpperCase()}</span>
                          </div>
                          <p className="text-[12px] text-[var(--text)] leading-relaxed">{ann.message}</p>
                          {ann.suggested_action && <p className="text-[11px] text-[#00e5c4] mt-1">→ {ann.suggested_action}</p>}
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
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#00e5c4]/10 flex items-center justify-center">
              <Info size={14} className="text-[#00e5c4]" aria-hidden="true" />
            </div>
            <h2 id="info-modal-title" className="text-base font-bold text-[var(--text)]">Як працює аналіз даних</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити інформацію"
            className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 text-[12px] text-[var(--muted)] leading-relaxed">

          {/* Section 1 — 30-day window */}
          <div className="bg-[#00e5c4]/5 border border-[#00e5c4]/20 rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[#00e5c4]/80 mb-2">Захист від старих даних</div>
            <p className="text-[var(--text)] mb-2">
              Агенти <strong>автоматично ігнорують старі дані</strong> — наприклад, дані минулого року або минулого сезону.
            </p>
            <p>
              Кожен агент при запуску обраховує вікна відносно поточного дня:
            </p>
            <div className="mt-2 space-y-1 font-mono text-[11px]">
              <div className="flex gap-3"><span className="text-[#00e5c4]">d7</span><span>= сьогодні − 7 днів → продажі за тиждень</span></div>
              <div className="flex gap-3"><span className="text-[#00e5c4]">d14</span><span>= сьогодні − 14 днів → попередній тиждень (для тренду)</span></div>
              <div className="flex gap-3"><span className="text-[#00e5c4]">d30</span><span>= сьогодні − 30 днів → місячна швидкість продажів</span></div>
            </div>
            <p className="mt-2">
              Навіть якщо в базі є записи за попередні роки — агент їх <strong>не бачить</strong>, бо фільтр <span className="font-mono bg-[var(--input-bg)] px-1 rounded">date ≥ d30</span> відсікає все старіше 30 днів. Це стандартна поведінка, коли поле «від» не заповнене.
            </p>
          </div>

          {/* Section 2 — період даних (від/до) */}
          <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Період даних «від — до» (поля вище)</div>
            <p className="mb-2">
              <strong>«До» (дата аналізу)</strong> — агент запускається <strong>ніби зараз — ця дата</strong>. Наприклад, якщо обрати 1 травня — агент вважатиме що "сьогодні" 1 травня і порахує всі вікна відносно неї.
            </p>
            <p className="mb-2">
              <strong>«Від» (початок вікна)</strong> — необовʼязкове. Якщо заповнене, агенти беруть дані <strong>тільки в межах періоду «від — до»</strong>, і розрахунок змінюється:
            </p>
            <div className="mb-2 space-y-1 font-mono text-[11px]">
              <div className="flex gap-3"><span className="text-[#a78bfa]">Швидкість</span><span>= продажі за період ÷ днів у періоді (замість ÷30)</span></div>
              <div className="flex gap-3"><span className="text-[#a78bfa]">WOH</span><span>= залишок ÷ швидкість за період</span></div>
              <div className="flex gap-3"><span className="text-[#a78bfa]">Тренд</span><span>= друга половина періоду vs перша половина</span></div>
              <div className="flex gap-3"><span className="text-[#a78bfa]">STR</span><span>= продажі за останні 7 днів періоду ÷ залишок</span></div>
            </div>
            <p>Корисно для:</p>
            <ul className="mt-1 space-y-1 list-none pl-0">
              <li className="flex gap-2"><span className="text-[#00e5c4]">→</span>Аналізу конкретного сезону: "тільки дані з 1 вересня" (старий сезон не змішується)</li>
              <li className="flex gap-2"><span className="text-[#00e5c4]">→</span>Ретроспективи: "який стан був 2 тижні тому?"</li>
              <li className="flex gap-2"><span className="text-[#00e5c4]">→</span>Перевірки: "чи правильно агент оцінив би ситуацію тоді?"</li>
            </ul>
          </div>

          {/* Section 3 — Caveats per block */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[var(--surface2)] border-b border-[var(--border)]">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)]">Застереження при аналізі минулих дат</div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#00e5c4]/10 text-[#00e5c4]">БЛОК 1–2</span>
                  <span className="text-[var(--text)] font-semibold">Inventory, Channel, Attributes, Repricing, Reordering</span>
                </div>
                <p>Продажі — точні (беруться з реальних записів). Залишки на складі — <strong>ближній знімок до обраної дати</strong>. Якщо щоденні знімки не зберігались — будуть використані поточні залишки.</p>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fbbf24]/10 text-[#fbbf24]">БЛОК 3</span>
                  <span className="text-[var(--text)] font-semibold">Commercial Marketer, Calendar Agent</span>
                </div>
                <p>Ці агенти генерують рекомендації <strong>на майбутнє</strong>: "запусти email сьогодні", "заплануй на наступний тиждень". При аналізі минулої дати рекомендації будуть датовані тим часом — <strong>не actionable</strong>, але корисні для ретроспективи.</p>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fb923c]/10 text-[#fb923c]">БЛОК 4</span>
                  <span className="text-[var(--text)] font-semibold">Campaign Analysis, Weekly Report</span>
                </div>
                <p>Читають збережені результати попередніх агентів з бази. Обрана дата <strong>майже не впливає</strong> на їх вивід — вони завжди аналізують останні збережені дані.</p>
              </div>
            </div>
          </div>

          {/* Section 4 — нюанси власного періоду */}
          <div className="bg-[#a78bfa]/5 border border-[#a78bfa]/20 rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[#a78bfa]/80 mb-2">Нюанси власного періоду «від»</div>
            <ul className="space-y-1.5 list-none pl-0">
              <li className="flex gap-2"><span className="text-[#a78bfa]">·</span>Залишки на складі завжди беруться на дату <strong>«до»</strong> (найближчий знімок) — поле «від» на них не впливає.</li>
              <li className="flex gap-2"><span className="text-[#a78bfa]">·</span>Дуже короткий період (менше 7 днів) робить тренд і STR нестабільними — половини періоду занадто малі.</li>
              <li className="flex gap-2"><span className="text-[#a78bfa]">·</span>Дуже довгий період (90+ днів) усереднює швидкість продажів — WOH може виглядати краще/гірше за реальний поточний темп.</li>
              <li className="flex gap-2"><span className="text-[#a78bfa]">·</span>Обраний період зберігається в кожному запуску агента — його видно у вікні «Трасування» (поля asOf і dateFrom).</li>
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
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-0.5">
              Трасування агента
            </div>
            <h2 id="debug-modal-title" className="text-base font-bold text-[var(--text)]">{agentLabel}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити трасування агента"
            className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Metadata */}
          <div className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-3">Метадані запуску</div>
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
                ...(debug.decisionCount != null ? [{ label: "Рішень PM", value: String(debug.decisionCount) }] : []),
                ...(debug.campaignCount != null ? [{ label: "Кампаній", value: String(debug.campaignCount) }] : []),
                ...(debug.calendarEventCount != null ? [{ label: "Подій", value: String(debug.calendarEventCount) }] : []),
                ...(debug.agentsIncluded != null ? [{ label: "Агентів", value: String(debug.agentsIncluded) }] : []),
                ...(runId ? [{ label: "Run ID", value: runId.slice(0, 12) + "…" }] : []),
                ...(debug.asOf ? [{ label: "Дата аналізу", value: debug.asOf, color: "#fbbf24" }] : []),
                ...(debug.dateFrom ? [{ label: "Дані від", value: debug.dateFrom, color: "#a78bfa" }] : []),
                ...(debug.analyzedAt ? [{ label: "Час аналізу", value: new Date(debug.analyzedAt).toLocaleTimeString("uk-UA") }] : []),
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--row)] rounded-lg px-3 py-2">
                  <div className="text-[9px] font-mono uppercase text-[var(--subtle)]">{label}</div>
                  <div className="text-[11px] font-mono font-semibold mt-0.5" style={{ color: color ?? "var(--text)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Weeks analyzed (Calendar Agent) */}
          {Array.isArray(debug.weeksAnalyzed) && debug.weeksAnalyzed.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-mono text-[var(--subtle)] uppercase tracking-wide">Тижні:</span>
              {debug.weeksAnalyzed.map((w: string) => (
                <span key={w} className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24]">{w}</span>
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
            <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#fbbf24]/70 mb-1">Парсинг не вдався</div>
              <p className="text-[12px] text-[var(--muted)]">
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
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className="font-semibold text-[var(--text)] text-sm">{b.brand_name}</span>
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
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
            <div className="hidden sm:flex items-center gap-4 text-[11px] font-mono text-[var(--muted)]">
              <span>WOH <span className="text-[var(--text)]">{b.metrics.wohDays}d</span></span>
              <span>STR <span className="text-[var(--text)]">{b.metrics.strPercent}%</span></span>
              <span>
                {b.metrics.trend7dPct > 0 ? (
                  <TrendingUp size={11} className="inline text-[#86efac]" aria-hidden="true" />
                ) : b.metrics.trend7dPct < 0 ? (
                  <TrendingDown size={11} className="inline text-[#fca5a5]" aria-hidden="true" />
                ) : (
                  <Minus size={11} className="inline text-[var(--subtle)]" aria-hidden="true" />
                )}
                {" "}{b.metrics.trend7dPct > 0 ? "+" : ""}{b.metrics.trend7dPct}%
              </span>
            </div>
          )}
          {open ? <ChevronUp size={14} className="text-[var(--subtle)]" aria-hidden="true" /> : <ChevronDown size={14} className="text-[var(--subtle)]" aria-hidden="true" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--border-faint)]">
          <p className="text-sm text-[var(--muted)] mt-3">{b.analysis}</p>
          {b.metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {[
                { label: "Склад", value: b.metrics.totalStock + " шт" },
                { label: "Продаж 7д", value: b.metrics.salesLast7d + " шт" },
                { label: "Продаж 30д", value: b.metrics.salesLast30d + " шт" },
                { label: "GM", value: b.metrics.gmPercent + "%" },
              ].map((item) => (
                <div key={item.label} className="bg-[var(--row)] rounded-lg px-3 py-2">
                  <div className="text-[9px] font-mono uppercase text-[var(--subtle)]">{item.label}</div>
                  <div className="text-sm font-mono font-semibold text-[var(--text)] mt-0.5">{item.value}</div>
                </div>
              ))}
            </div>
          )}
          {b.suggested_actions?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span className="text-[10px] text-[var(--subtle)]">Дії:</span>
              {b.suggested_actions.map((a) => (
                <span key={a} className="text-[10px] font-mono px-2 py-0.5 bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--muted)]">
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
}: {
  agent: (typeof AGENTS)[0];
  run?: AgentRunInfo;
  onRun: () => void;
  isFirst: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [simParams, setSimParams] = useState<PromoSimParams | null>(null);
  const [reorderParams, setReorderParams] = useState<ReorderSimParams | null>(null);
  const [provider, setProvider] = useState<string>("anthropic");
  const Icon = agent.icon;
  const s = run?.status ?? "idle";
  const output = run?.output ?? {};

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
  const healthScore: any = output.health_score ?? null;
  const criticalAnnotations = annotations.filter((a: any) => a.priority === "critical").length;

  // Campaign Analysis
  const campaigns: any[] = agent.id === "campaign_analysis" ? (output.campaigns ?? []) : [];
  const campaignOverallHealth: string = output.overall_health ?? "";
  const campaignsBehind = campaigns.filter((c: any) => c.status === "behind" || c.status === "stalled").length;

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
      className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl overflow-hidden"
      style={{ borderLeft: `3px solid ${agent.color}` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: agent.color + "15" }}
            >
              <Icon size={15} style={{ color: agent.color }} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-[var(--text)]">{agent.label}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--input-bg)] text-[var(--subtle)]">
                  {agent.model}
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--input-bg)] text-[var(--subtle)]">
                  {provider === "openai" ? "OpenAI" : "Anthropic"}
                </span>
                {!AGENT_ROUTES[agent.id] && (
                  <span className="text-[9px] font-mono text-[var(--subtle)]">• скоро</span>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">{agent.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {agentStatusIcon(s)}
            <button
              type="button"
              onClick={onRun}
              disabled={s === "running"}
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
              {s === "running" ? "Працює…" : "Запустити"}
            </button>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-3 mt-3 text-[10px] font-mono text-[var(--subtle)]">
          <span>
            Статус:{" "}
            <span
              className={
                s === "done"
                  ? "text-[#00e5c4]"
                  : s === "running"
                    ? "text-[#fbbf24]"
                    : s === "error"
                      ? "text-[#ef4444]"
                      : "text-[var(--subtle)]"
              }
            >
              {s === "idle" ? "очікування" : s === "running" ? "працює" : s === "done" ? "готово" : "помилка"}
            </span>
          </span>
          {run?.finishedAt && (
            <span>Останній запуск: <span className="text-[var(--muted)]">{fmtDate(run.finishedAt)}</span></span>
          )}
          {duration(run) && (
            <span>Час: <span className="text-[var(--muted)]">{duration(run)}</span></span>
          )}
        </div>

        {/* Summary badges — Inventory Analyst */}
        {s === "done" && brands.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {criticalCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {criticalCount} критичних
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24]">
                {warningCount} попереджень
              </span>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4]">
                Все гаразд
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : `Детально (${brands.length} брендів) ↓`}
            </button>
          </div>
        )}

        {/* Summary badges — Channel Analytics */}
        {s === "done" && channels.length > 0 && brands.length === 0 && byCategory.length === 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {topChannel && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4]">
                Топ: {topChannel}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--input-bg)] border border-[var(--border)] text-[var(--muted)]">
              {channels.length} каналів
            </span>
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Product Attributes */}
        {s === "done" && byCategory.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {bestsellers.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4]">
                Бестселери: {bestsellers.slice(0, 2).join(", ")}
              </span>
            )}
            {deadStock.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                Dead stock: {deadStock.slice(0, 2).join(", ")}
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : `Детально (${byCategory.length} категорій) ↓`}
            </button>
          </div>
        )}

        {/* Summary badges — Repricing / Reordering */}
        {s === "done" && decisionBrands.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#a78bfa]/10 border border-[#a78bfa]/20 text-[#a78bfa]">
              {decisionBrands.length} {agent.id === "repricing" ? "брендів до уцінки" : "брендів до дозамовлення"}
            </span>
            {recommendedCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4]">
                {recommendedCount} рекомендацій готово
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Commercial Marketer */}
        {s === "done" && marketerBrands.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24]">
              {marketerBrands.length} брифів готово
            </span>
            {marketerBrands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {marketerBrands.filter((b: any) => b.urgency === "critical" || b.urgency === "high").length} термінових
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Calendar Agent */}
        {s === "done" && (annotations.length > 0 || healthScore) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {healthScore?.coverage_percent != null && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24]">
                Coverage: {healthScore.coverage_percent}%
              </span>
            )}
            {criticalAnnotations > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {criticalAnnotations} критичних прогалин
              </span>
            )}
            {annotations.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--input-bg)] border border-[var(--border)] text-[var(--muted)]">
                {annotations.length} анотацій
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Campaign Analysis */}
        {s === "done" && campaigns.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {campaignOverallHealth && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                campaignOverallHealth === "on_track"
                  ? "bg-[#00e5c4]/10 border-[#00e5c4]/20 text-[#00e5c4]"
                  : campaignOverallHealth === "critical"
                    ? "bg-[#ef4444]/10 border-[#ef4444]/20 text-[#ef4444]"
                    : "bg-[#fbbf24]/10 border-[#fbbf24]/20 text-[#fbbf24]"
              }`}>
                {campaignOverallHealth === "on_track" ? "На правильному шляху" : campaignOverallHealth === "critical" ? "Критично" : "Потребує уваги"}
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--input-bg)] border border-[var(--border)] text-[var(--muted)]">
              {campaigns.length} кампаній
            </span>
            {campaignsBehind > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ef4444]/10 border border-[#ef4444]/20 text-[#ef4444]">
                {campaignsBehind} відстають
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
              {expanded ? "Згорнути ↑" : "Детально ↓"}
            </button>
          </div>
        )}

        {/* Summary badges — Weekly Report */}
        {s === "done" && isWeeklyReport && (output.pm_brief || output.summary) && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {output.week && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fb923c]/10 border border-[#fb923c]/20 text-[#fb923c]">
                {output.week}
              </span>
            )}
            {weeklyPriorities.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--input-bg)] border border-[var(--border)] text-[var(--muted)]">
                {weeklyPriorities.length} пріоритетів
              </span>
            )}
            {weeklyDecisions.length > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24]/20 text-[#fbbf24]">
                {weeklyDecisions.length} рішень PM
              </span>
            )}
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] ml-auto">
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
          <p className="mt-2 text-[11px] text-[var(--muted)]">{run.output.message}</p>
        )}
        {s === "done" && isWeeklyReport && !output.pm_brief && run?.output?.message && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">{run.output.message}</p>
        )}

        {/* Action buttons row */}
        {s === "done" && (output.summary || output.brands?.length || output.channels?.length || output.by_category?.length || decisionBrands.length > 0 || marketerBrands.length > 0 || annotations.length > 0 || campaigns.length > 0 || (isWeeklyReport && output.pm_brief)) && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--muted)] hover:text-[var(--text)] transition-colors border border-[var(--border)] rounded-lg px-3 py-1.5 hover:bg-[var(--input-bg)]"
            >
              <Eye size={11} aria-hidden="true" />
              Переглянути аналіз
            </button>
            {output._debug && (
              <button
                type="button"
                onClick={() => setShowDebug(true)}
                className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--subtle)] hover:text-[var(--text)] transition-colors border border-[var(--border)] rounded-lg px-3 py-1.5 hover:bg-[var(--input-bg)]"
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
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
          {brands.map((b) => (
            <BrandCard key={b.brand_id} b={b} />
          ))}
        </div>
      )}

      {/* Expanded — Channel Analytics */}
      {expanded && channels.length > 0 && brands.length === 0 && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
          {output.summary && (
            <p className="text-sm text-[var(--muted)] pb-2">{output.summary}</p>
          )}
          {channels.map((ch: any, i: number) => (
            <div key={i} className="bg-[var(--row)] rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-[var(--text)] capitalize">{ch.channel}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  ch.status === "best" ? "bg-[#00e5c4]/10 text-[#00e5c4]" :
                  ch.status === "weak" || ch.status === "inactive" ? "bg-[#fbbf24]/10 text-[#fbbf24]" :
                  "bg-[var(--input-bg)] text-[var(--muted)]"
                }`}>
                  {ch.status?.toUpperCase()}
                </span>
              </div>
              {ch.insight && <p className="text-[11px] text-[var(--muted)]">{ch.insight}</p>}
              {ch.recommendation && (
                <p className="text-[11px] text-[#00e5c4] mt-1">→ {ch.recommendation}</p>
              )}
            </div>
          ))}
          {output.action && (
            <div className="mt-2 px-3 py-2 bg-[#00e5c4]/5 border border-[#00e5c4]/20 rounded-lg">
              <span className="text-[10px] font-mono text-[var(--subtle)]">Дія: </span>
              <span className="text-[11px] text-[#00e5c4]">{output.action}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — Product Attributes */}
      {expanded && byCategory.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
          {output.summary && (
            <p className="text-sm text-[var(--muted)] pb-2">{output.summary}</p>
          )}
          {byCategory.map((cat: any, i: number) => (
            <div key={i} className="bg-[var(--row)] rounded-lg px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-[var(--text)]">{cat.category || cat.attribute}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  cat.status === "bestseller" ? "bg-[#00e5c4]/10 text-[#00e5c4]" :
                  cat.status === "dead" ? "bg-[#ef4444]/10 text-[#ef4444]" :
                  cat.status === "slow" ? "bg-[#fbbf24]/10 text-[#fbbf24]" :
                  "bg-[var(--input-bg)] text-[var(--muted)]"
                }`}>
                  {(cat.status || "normal").toUpperCase()}
                </span>
              </div>
              {cat.insight && <p className="text-[11px] text-[var(--muted)]">{cat.insight}</p>}
              {cat.recommendation && (
                <p className="text-[11px] text-[#00e5c4] mt-1">→ {cat.recommendation}</p>
              )}
            </div>
          ))}
          {output.action && (
            <div className="mt-2 px-3 py-2 bg-[#00e5c4]/5 border border-[#00e5c4]/20 rounded-lg">
              <span className="text-[10px] font-mono text-[var(--subtle)]">Дія: </span>
              <span className="text-[11px] text-[#00e5c4]">{output.action}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — Repricing / Reordering */}
      {expanded && decisionBrands.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">
          {decisionBrands.map((brand: any) => {
            const items: any[] = brand.options ?? brand.scenarios ?? [];
            const recommended = items.find((i: any) => i.evaluation?.recommended);
            return (
              <div key={brand.brand_id} className="border border-[#a78bfa]/20 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-[#a78bfa]/5 flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-sm text-[var(--text)]">{brand.brand_name}</span>
                    {brand.current_situation && (
                      <p className="text-[11px] text-[var(--muted)] mt-0.5">{brand.current_situation}</p>
                    )}
                  </div>
                  {recommended && (
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-[#00e5c4]/10 border border-[#00e5c4]/20 text-[#00e5c4] flex-shrink-0 ml-3">
                      ✓ {recommended.label}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[var(--border)]">
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
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                            background: agent.color + "20", color: agent.color,
                          }}>
                            {item.strategy_type ?? item.type}
                          </span>
                          <span className="text-[12px] font-semibold text-[var(--text)]">{item.label}</span>
                          {isRec && (
                            <span className="text-[9px] font-mono text-[#00e5c4] ml-auto">★ РЕКОМЕНДОВАНО</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--muted)] mt-1 flex-wrap">
                          {item.discount_percent !== undefined && (
                            <span>Знижка: <span className="text-[var(--text)]">-{item.discount_percent}%</span></span>
                          )}
                          {item.duration_days && (
                            <span>Строк: <span className="text-[var(--text)]">{item.duration_days}д</span></span>
                          )}
                          {item.forecast?.woh_after !== undefined && (
                            <span>WOH після: <span className="text-[var(--text)]">{item.forecast.woh_after}д</span></span>
                          )}
                          {item.woh_after !== undefined && (
                            <span>WOH після: <span className="text-[var(--text)]">{item.woh_after}д</span></span>
                          )}
                          {item.qty_multiplier !== undefined && (
                            <span>Обʼєм: <span className="text-[var(--text)]">×{item.qty_multiplier}</span></span>
                          )}
                          <span className="ml-auto">
                            Оцінка: <span style={{ color: score >= 7 ? "#00e5c4" : score >= 5 ? "#fbbf24" : "#ef4444" }}>
                              {score}/10
                            </span>
                          </span>
                        </div>
                        {item.evaluation?.risks?.length > 0 && (
                          <p className="text-[10px] text-[#fbbf24] mt-1.5">
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
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">
          {output.summary && <p className="text-sm text-[var(--muted)]">{output.summary}</p>}
          {marketerBrands.map((brand: any) => (
            <div key={brand.brand_id} className="border border-[#fbbf24]/20 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#fbbf24]/5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm text-[var(--text)]">{brand.brand_name}</span>
                  {brand.decision_summary && <p className="text-[11px] text-[var(--muted)] mt-0.5">{brand.decision_summary}</p>}
                </div>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded flex-shrink-0 ml-3 ${
                  brand.urgency === "critical" ? "bg-[#ef4444]/10 text-[#ef4444]" :
                  brand.urgency === "high" ? "bg-[#fbbf24]/10 text-[#fbbf24]" :
                  "bg-[var(--input-bg)] text-[var(--muted)]"
                }`}>{(brand.urgency ?? "medium").toUpperCase()}</span>
              </div>
              {brand.key_message && (
                <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--surface2)]">
                  <span className="text-[9px] font-mono text-[var(--subtle)] uppercase tracking-wide">Ключове повідомлення: </span>
                  <span className="text-[12px] text-[var(--text)]">"{brand.key_message}"</span>
                </div>
              )}
              <div className="divide-y divide-[var(--border)]">
                {Object.entries(brand.channels ?? {}).map(([ch, v]: [string, any]) => v?.action_needed ? (
                  <div key={ch} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fbbf24]/15 text-[#fbbf24] uppercase flex-shrink-0 mt-0.5">{ch}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] text-[var(--text)]">{v.brief}</p>
                      {v.frequency && <p className="text-[10px] text-[var(--muted)] mt-0.5">Частота: {v.frequency}</p>}
                      {v.send_timing && <p className="text-[10px] text-[var(--muted)] mt-0.5">Відправити: {v.send_timing}</p>}
                      {v.budget_recommendation && <p className="text-[10px] text-[#00e5c4] mt-0.5">Бюджет: {v.budget_recommendation}</p>}
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
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-3">
          {healthScore?.summary && <p className="text-sm text-[var(--muted)]">{healthScore.summary}</p>}
          {output.summary && output.summary !== healthScore?.summary && (
            <p className="text-sm text-[var(--muted)]">{output.summary}</p>
          )}
          {annotations.map((ann: any, i: number) => {
            const prioColor = ann.priority === "critical" ? "#ef4444" : ann.priority === "high" ? "#fbbf24" : ann.priority === "medium" ? "#a78bfa" : "#6b7a8d";
            const typeIcon = ann.type === "gap" ? "○" : ann.type === "conflict" ? "✕" : ann.type === "timing" ? "⏱" : "✓";
            return (
              <div key={ann.id ?? i} className="border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-[10px] font-mono" style={{ color: prioColor }}>{typeIcon} {(ann.type ?? "").toUpperCase()}</span>
                  {ann.channel && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#fbbf24]/15 text-[#fbbf24]">{ann.channel}</span>}
                  {ann.brand && <span className="text-[9px] font-mono text-[var(--subtle)]">{ann.brand}</span>}
                  <span className="text-[9px] font-mono ml-auto" style={{ color: prioColor }}>{(ann.priority ?? "").toUpperCase()}</span>
                </div>
                <p className="text-[12px] text-[var(--text)]">{ann.message}</p>
                {ann.suggested_action && (
                  <p className="text-[11px] text-[#00e5c4] mt-1">→ {ann.suggested_action}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded — Campaign Analysis */}
      {expanded && campaigns.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-3">
          {output.summary && <p className="text-sm text-[var(--muted)]">{output.summary}</p>}
          {campaigns.map((camp: any, i: number) => {
            const statusColor = camp.status === "ahead" ? "#00e5c4" : camp.status === "on_track" ? "#86efac" : camp.status === "behind" ? "#fbbf24" : "#ef4444";
            return (
              <div key={camp.campaign_id ?? i} className="border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-semibold text-sm text-[var(--text)]">{camp.brand_name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: statusColor + "20", color: statusColor, border: `1px solid ${statusColor}30` }}>
                    {camp.status?.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono text-[var(--subtle)] ml-auto">{camp.days_running ?? 0}д · {camp.performance_score ?? 0}/10</span>
                </div>
                {camp.actual_observation && <p className="text-[11px] text-[var(--muted)] mb-1">{camp.actual_observation}</p>}
                {camp.next_action && <p className="text-[11px] text-[#00e5c4]">→ {camp.next_action}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded — Weekly Report */}
      {expanded && isWeeklyReport && (output.pm_brief || output.marketing_brief) && (
        <div className="border-t border-[var(--border)] px-4 py-4 space-y-4">
          {output.summary && (
            <p className="text-sm text-[var(--text)] font-medium">{output.summary}</p>
          )}
          {output.pm_brief && (
            <div className="bg-[var(--row)] rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">PM Brief</div>
              <p className="text-[12px] text-[var(--text)] leading-relaxed">{output.pm_brief}</p>
            </div>
          )}
          {output.marketing_brief && (
            <div className="bg-[var(--row)] rounded-xl p-4">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Marketing Brief</div>
              <p className="text-[12px] text-[var(--text)] leading-relaxed">{output.marketing_brief}</p>
            </div>
          )}
          {weeklyPriorities.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">Пріоритети</div>
              <div className="space-y-2">
                {weeklyPriorities.map((p: any) => (
                  <div key={p.rank} className="flex items-start gap-3 py-2 border-b border-[var(--border)] last:border-0">
                    <span className="text-[11px] font-mono font-bold text-[#fb923c] w-5 flex-shrink-0">#{p.rank}</span>
                    <div className="min-w-0">
                      <span className="text-[11px] text-[var(--text)]">{p.action}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.brand && p.brand !== "все" && <span className="text-[9px] font-mono text-[var(--subtle)]">{p.brand}</span>}
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${p.deadline === "today" ? "bg-[#ef4444]/10 text-[#ef4444]" : p.deadline === "tomorrow" ? "bg-[#fbbf24]/10 text-[#fbbf24]" : "bg-[var(--input-bg)] text-[var(--muted)]"}`}>
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
            <div className="bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-xl p-3">
              <div className="text-[9px] font-mono uppercase tracking-widest text-[#fbbf24]/70 mb-2">Рішення PM</div>
              <ul className="space-y-1">
                {weeklyDecisions.map((d: string, i: number) => (
                  <li key={i} className="text-[11px] text-[var(--text)]">· {d}</li>
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
    </div>
  );
}

// ─── Pipeline diagram ─────────────────────────────────────────────────────────

function PipelineDiagram({ runs }: { runs: Record<string, AgentRunInfo> }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6 overflow-x-auto">
      <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-4">Пайплайн агентів</div>
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
                  const s = run?.status ?? "idle";
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
                  <div className="w-6 h-px bg-[var(--border)]" />
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
  const [analysisDate, setAnalysisDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateFrom, setDateFrom] = useState(""); // "" = стандартне вікно 30 днів
  const [showInfo, setShowInfo] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);
  const { runs, loading, statusError, fetchStatus, handleRun } = useAgentRuns({ analysisDate, dateFrom, todayStr });
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
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)] mb-2">AI Pipeline</div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Агенти</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              9 агентів · {totalDone} виконано
              {totalError > 0 && <span className="text-[#ef4444] ml-2">· {totalError} помилок</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--subtle)]">
              <Zap size={11} className="text-[#fbbf24]" aria-hidden="true" />
              Claude Sonnet / Haiku
            </div>
            <button
              type="button"
              onClick={fetchStatus}
              aria-label="Оновити статус агентів"
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
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
      <div className="mb-4 bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarDays size={14} className="text-[var(--subtle)]" aria-hidden="true" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--subtle)]">Період даних</span>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="agents-date-from" className="text-[10px] font-mono text-[var(--subtle)]">від</label>
            <input
              id="agents-date-from"
              name="agents-date-from"
              type="date"
              value={dateFrom}
              max={maxFromStr}
              aria-label="Дата початку періоду"
              onChange={(e) => setDateFrom(e.target.value || "")}
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text)] focus:outline-none focus:border-[#00e5c4]/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="agents-date-to" className="text-[10px] font-mono text-[var(--subtle)]">до</label>
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
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text)] focus:outline-none focus:border-[#00e5c4]/50"
            />
          </div>
          {(isHistoricalDate || hasDateFrom) && (
            <button
              type="button"
              onClick={() => { setAnalysisDate(todayStr); setDateFrom(""); }}
              className="text-[10px] font-mono px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
            >
              Скинути
            </button>
          )}
          {!isHistoricalDate && !hasDateFrom && (
            <span className="text-[10px] font-mono text-[#00e5c4]">Останні 30 днів (стандарт)</span>
          )}
          {hasDateFrom && (
            <span className="text-[10px] font-mono text-[#a78bfa]">Період: {periodDays} дн.</span>
          )}
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--input-bg)] transition-colors"
          >
            <Info size={11} aria-hidden="true" />
            Важлива інформація
          </button>
        </div>

        {/* Warning for custom period */}
        {hasDateFrom && (
          <div className="mt-3 flex items-start gap-2 bg-[#a78bfa]/5 border border-[#a78bfa]/20 rounded-lg px-3 py-2.5">
            <Info size={12} className="text-[#a78bfa] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-[var(--muted)] leading-relaxed">
              <span className="text-[#a78bfa] font-semibold">Власний період ({periodDays} дн.):</span> швидкість продажів і WOH рахуються за весь період <span className="text-[var(--text)]">{dateFrom} — {analysisDate}</span> замість стандартних 30 днів. Тренд = друга половина періоду проти першої. Дані раніше дати «від» агенти не бачать.
            </p>
          </div>
        )}

        {/* Warnings for historical date */}
        {isHistoricalDate && (
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2 bg-[#fbbf24]/5 border border-[#fbbf24]/20 rounded-lg px-3 py-2.5">
              <AlertTriangle size={12} className="text-[#fbbf24] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                <span className="text-[#fbbf24] font-semibold">Блоки 1–2:</span> Метрики продажів пораховані {hasDateFrom ? `за період ${dateFrom} — ${analysisDate}` : `за 7/30 днів до ${analysisDate}`}. Залишки на складі — найближчий знімок до дати <span className="text-[var(--text)]">{analysisDate}</span> (якщо щоденні знімки не записувались, будуть використані поточні залишки).
              </p>
            </div>
            <div className="flex items-start gap-2 bg-[#a78bfa]/5 border border-[#a78bfa]/20 rounded-lg px-3 py-2.5">
              <AlertTriangle size={12} className="text-[#a78bfa] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                <span className="text-[#a78bfa] font-semibold">Блок 3 (Execution):</span> Commercial Marketer та Calendar Agent генерують рекомендації на майбутнє — при минулій даті вони будуть ретроспективними, не actionable.
              </p>
            </div>
            <div className="flex items-start gap-2 bg-[#6b7a8d]/5 border border-[#6b7a8d]/20 rounded-lg px-3 py-2.5">
              <Clock size={12} className="text-[var(--subtle)] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                <span className="text-[var(--text)] font-semibold">Блок 4 (Tracking):</span> Campaign Analysis та Weekly Report читають збережені результати інших агентів — обрана дата майже не впливає на їх вивід.
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
                <div className="h-px flex-1 bg-[var(--border)]" />
                <div
                  className="text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded-full border"
                  style={{ color: block.color, borderColor: block.color + "40", background: block.color + "10" }}
                >
                  Блок {block.id} — {block.label}
                </div>
                <div className="text-[9px] font-mono text-[var(--subtle)]">{block.desc}</div>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <div className="space-y-3">
                {blockAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    run={runs[agent.id]}
                    onRun={() => handleRun(agent.id)}
                    isFirst={agent.id === "inventory_analyst"}
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
      <div className="mt-8 pt-4 border-t border-[var(--border)] flex items-center gap-6 flex-wrap">
        {[
          { color: "var(--subtle)", label: "Очікування" },
          { color: "#fbbf24", label: "Працює" },
          { color: "#00e5c4", label: "Готово" },
          { color: "#ef4444", label: "Помилка" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--muted)]">
            <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
            {item.label}
          </div>
        ))}
        <span className="text-[10px] font-mono text-[var(--subtle)] ml-auto">
          9 агентів · 4 блоки · повний пайплайн
        </span>
      </div>
    </div>
  );
}
