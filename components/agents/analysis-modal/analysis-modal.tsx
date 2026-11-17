import { useState, type ReactNode } from "react";
import { Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Dialog } from "@/components/ui/dialog/dialog";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { cn } from "@/lib/utils";
import { InsightList } from "../insight-list/insight-list";
import { buildCategoryInsightRows, buildChannelInsightRows } from "../insight-list/insight-rows";
import PromoTableModal, { type PromoSimParams } from "@/components/agents/promo-table-modal/promo-table-modal";
import ReorderTableModal, { type ReorderSimParams } from "@/components/agents/reorder-table-modal/reorder-table-modal";
import { buildReorderParams, buildSimParams, formatWohDays } from "@/components/agents/agents.utils";
import { badgeStyle, campaignHealthLabel, campaignHealthClasses, campaignStatusColor, campaignMetricLabel } from "../agent-card-presentation";
import { getBrandStatus } from "../brand-status";

function AnalysisCallout({ title, accent = false, children }: {
  title: string;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border p-4", accent ? "border-accent-cyan/20 bg-accent-cyan/5" : "border-(--border) bg-(--surface2)")}>
      <Heading as="h3" variant="eyebrow" className={cn("mb-2", accent && "text-accent-cyan")}>{title}</Heading>
      <Text variant="body" className={accent ? "font-medium text-accent-cyan" : "text-(--text)"}>{children}</Text>
    </div>
  );
}

export function AnalysisModal({
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
  const [simParams, setSimParams] = useState<PromoSimParams | null>(null);
  const [reorderParams, setReorderParams] = useState<ReorderSimParams | null>(null);

  return (
    <>
      <Dialog title={agentLabel} subtitle="Повний аналіз" closeLabel="Закрити повний аналіз" onClose={onClose}>
        <div className="px-6 py-5 space-y-5">
          {output.summary && (
            <AnalysisCallout title="Загальний висновок">{output.summary}</AnalysisCallout>
          )}

          {output.action && (
            <AnalysisCallout title="Головна дія" accent>{output.action}</AnalysisCallout>
          )}

          {agentId === "inventory_analyst" && Array.isArray(output.brands) && output.brands.length > 0 && (
            <div>
              <Heading as="h3" variant="eyebrow">
                Аналіз по брендах ({output.brands.length})
              </Heading>
              <div className="space-y-3">
                {output.brands.map((b: any) => (
                  <div key={b.brand_id ?? b.brand_name} className="border border-(--border) rounded-xl p-4">
                    <div className="flex items-center mb-2">
                      <span className="font-semibold text-sm text-(--text)">{b.brand_name}</span>
                      <Badge size="small" className="ml-2 shrink-0" style={badgeStyle(getBrandStatus(b.status).color)}>{b.status?.toUpperCase()}</Badge>
                    </div>
                    {b.analysis && (
                      <p className="text-[12px] text-(--muted) leading-relaxed mb-2">{b.analysis}</p>
                    )}
                    {Array.isArray(b.suggested_actions) && b.suggested_actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {b.suggested_actions.map((a: string) => (
                          <Badge key={a} className="bg-(--row)">{a}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {agentId === "channel_analytics" && Array.isArray(output.channels) && output.channels.length > 0 && (
            <div>
              <Heading as="h3" variant="eyebrow">Аналіз по каналах ({output.channels.length})</Heading>
              <InsightList
                variant="dialog"
                capitalizeTitles
                rows={buildChannelInsightRows(output.channels, "dialog")}
              />
            </div>
          )}

          {agentId === "product_attributes" && Array.isArray(output.by_category) && output.by_category.length > 0 && (
            <div>
              <Heading as="h3" variant="eyebrow">Аналіз по категоріях ({output.by_category.length})</Heading>
              <InsightList
                variant="dialog"
                rows={buildCategoryInsightRows(output.by_category, "dialog")}
              />
            </div>
          )}

          {agentId === "product_attributes" && (
            <div className="flex gap-4 flex-wrap">
              {Array.isArray(output.bestsellers) && output.bestsellers.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Бестселери</div>
                  <div className="flex flex-wrap gap-1.5">
                    {output.bestsellers.map((b: string) => (
                      <Badge key={b} tone="positive">{b}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(output.dead_stock) && output.dead_stock.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-widest text-(--subtle) mb-2">Dead Stock</div>
                  <div className="flex flex-wrap gap-1.5">
                    {output.dead_stock.map((d: string) => (
                      <Badge key={d} tone="danger">{d}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
                      <div key={opt.option_id} className="px-4 py-4" style={{ background: opt.evaluation?.recommended ? "color-mix(in srgb, var(--cyan-ink) 5%, transparent)" : undefined }}>
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
                            <span>Маржа після <span className={opt.forecast.margin_after_percent < 10 ? "text-accent-danger" : "text-accent-cyan"}>
                              {opt.forecast.margin_after_percent}%
                            </span></span>
                          )}
                        </div>
                        {opt.evaluation?.pros?.length > 0 && (
                          <ul className="space-y-0.5 mb-2">
                            {opt.evaluation.pros.map((p: string, i: number) => (
                              <li key={i} className="text-[11px] text-accent-positive">+ {p}</li>
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
                          <Button
                            onClick={() => setSimParams(buildSimParams(brand, opt, output._debug))}
                            className="mt-3 border-(--signal-line) bg-(--signal-wash) px-3 py-1.5 text-(--signal-ink) hover:bg-(--signal-hover) hover:text-(--signal-ink)"
                          >
                            <Table2 size={11} aria-hidden="true" />
                            Переглянути в таблиці
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

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
                      const riskColor = sc.evaluation?.risk_level === "HIGH" ? "var(--danger-ink)" : sc.evaluation?.risk_level === "LOW" ? "var(--cyan-ink)" : "var(--amber-ink)";
                      return (
                        <div key={sc.scenario_id} className="px-4 py-4" style={{ background: sc.evaluation?.recommended ? "color-mix(in srgb, var(--cyan-ink) 5%, transparent)" : undefined }}>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-accent-purple/15 text-accent-purple">{sc.type}</span>
                            <span className="font-semibold text-sm text-(--text)">{sc.label}</span>
                            <Badge size="small" className="ml-1" style={badgeStyle(riskColor)}>
                              {sc.evaluation?.risk_level} RISK
                            </Badge>
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
                                <li key={i} className="text-[11px] text-accent-positive">+ {p}</li>
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
                            <Button
                              onClick={() => setReorderParams(buildReorderParams(brand, sc, output._debug))}
                              className="mt-3 border-(--signal-line) bg-(--signal-wash) px-3 py-1.5 text-(--signal-ink) hover:bg-(--signal-hover) hover:text-(--signal-ink)"
                            >
                              <Table2 size={11} aria-hidden="true" />
                              Переглянути в таблиці
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                      <Badge size="small" outlined={false} tone={brand.urgency === "critical" ? "danger" : "warning"}>
                        {(brand.urgency ?? "").toUpperCase()}
                      </Badge>
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
                  <Heading as="h3" variant="eyebrow">Кампанії ({output.campaigns.length})</Heading>
                  <div className="space-y-3">
                    {output.campaigns.map((camp: any, i: number) => {
                      const sc = campaignStatusColor(camp.status);
                      return (
                        <div key={camp.campaign_id ?? i} className="border border-(--border) rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-semibold text-sm text-(--text)">{camp.brand_name}</span>
                            <Badge size="small" style={badgeStyle(sc)}>{camp.status?.toUpperCase()}</Badge>
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
                  <Heading as="h3" variant="eyebrow">Топ пріоритети</Heading>
                  <div className="space-y-2">
                    {output.top_priorities.map((p: any) => (
                      <div key={p.rank} className="flex items-start gap-3 border border-(--border) rounded-xl p-3">
                        <span className="text-base font-bold text-accent-report w-6 shrink-0">#{p.rank}</span>
                        <div className="min-w-0">
                          <p className="text-[12px] text-(--text)">{p.action}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {p.brand && p.brand !== "все" && <span className="text-[10px] font-mono text-(--subtle)">{p.brand}</span>}
                            <Badge size="small" outlined={false} tone={p.deadline === "today" ? "danger" : p.deadline === "tomorrow" ? "warning" : "neutral"}>
                              {p.deadline}
                            </Badge>
                            {p.type && <Badge size="small" outlined={false} tone="report">{p.type}</Badge>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(output.decisions_needed) && output.decisions_needed.length > 0 && (
                <div className="bg-accent-yellow/5 border border-accent-yellow/20 rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-accent-yellow mb-2">Рішення PM</div>
                  <ul className="space-y-1.5">
                    {output.decisions_needed.map((d: string, i: number) => (
                      <li key={i} className="text-[12px] text-(--text)">· {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(output.wins) && output.wins.length > 0 && (
                <div className="bg-accent-cyan/5 border border-accent-cyan/20 rounded-xl p-4">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-accent-cyan mb-2">Перемоги тижня</div>
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
                    {output.health_score.critical_gaps > 0 && <span>Критичних: <span className="text-accent-danger">{output.health_score.critical_gaps}</span></span>}
                    {output.health_score.high_gaps > 0 && <span>Важливих: <span className="text-accent-yellow">{output.health_score.high_gaps}</span></span>}
                  </div>
                  {output.health_score.summary && <p className="text-[12px] text-(--muted) mt-2">{output.health_score.summary}</p>}
                </div>
              )}
              {Array.isArray(output.annotations) && output.annotations.length > 0 && (
                <div>
                  <Heading as="h3" variant="eyebrow">
                    Анотації ({output.annotations.length})
                  </Heading>
                  <div className="space-y-2">
                    {output.annotations.map((ann: any, i: number) => {
                      const prioColor = ann.priority === "critical" ? "var(--danger-ink)" : ann.priority === "high" ? "var(--amber-ink)" : ann.priority === "medium" ? "var(--violet-ink)" : "var(--muted)";
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
      </Dialog>

      {simParams && (
        <PromoTableModal params={simParams} onClose={() => setSimParams(null)} />
      )}

      {reorderParams && (
        <ReorderTableModal params={reorderParams} onClose={() => setReorderParams(null)} />
      )}
    </>
  );
}
