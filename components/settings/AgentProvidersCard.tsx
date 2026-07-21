"use client";

import { useState, useEffect } from "react";
import {
  BarChart2, TrendingDown, TrendingUp, Tag, ShoppingCart,
  Megaphone, CalendarDays, LineChart, FileText,
} from "lucide-react";

export type AgentProvider = "anthropic" | "openai";

export const AGENT_CONFIGS = [
  {
    id: "inventory_analyst",
    label: "Inventory Analyst",
    desc: "Статус брендів: CRITICAL / WARNING / BALANCED / EXCELLENT",
    block: "Core Analytics",
    defaultModel: { anthropic: "Claude Sonnet 4.6", openai: "GPT-4o" },
    icon: BarChart2,
    color: "#00e5c4",
  },
  {
    id: "channel_analytics",
    label: "Channel Analytics",
    desc: "Порівняння каналів продажів",
    block: "Core Analytics",
    defaultModel: { anthropic: "Claude Haiku 4.5", openai: "GPT-4o mini" },
    icon: TrendingUp,
    color: "#00e5c4",
  },
  {
    id: "product_attributes",
    label: "Product Attributes",
    desc: "Bestsellers vs мертвий сток за кольором/розміром",
    block: "Core Analytics",
    defaultModel: { anthropic: "Claude Haiku 4.5", openai: "GPT-4o mini" },
    icon: Tag,
    color: "#00e5c4",
  },
  {
    id: "repricing",
    label: "Repricing Strategy",
    desc: "3 варіанти уцінки з оцінкою ризиків",
    block: "Decision Support",
    defaultModel: { anthropic: "Claude Sonnet 4.6", openai: "GPT-4o" },
    icon: TrendingDown,
    color: "#a78bfa",
  },
  {
    id: "reordering",
    label: "Reordering Strategy",
    desc: "3 сценарії дозамовлення з фінансовими ризиками",
    block: "Decision Support",
    defaultModel: { anthropic: "Claude Sonnet 4.6", openai: "GPT-4o" },
    icon: ShoppingCart,
    color: "#a78bfa",
  },
  {
    id: "commercial_marketer",
    label: "Commercial Marketer",
    desc: "Брифи по 5 каналах після рішення PM",
    block: "Execution",
    defaultModel: { anthropic: "Claude Sonnet 4.6", openai: "GPT-4o" },
    icon: Megaphone,
    color: "#fbbf24",
  },
  {
    id: "calendar_agent",
    label: "Calendar Agent",
    desc: "Gaps і конфлікти в маркетинговому плані",
    block: "Execution",
    defaultModel: { anthropic: "Claude Haiku 4.5", openai: "GPT-4o mini" },
    icon: CalendarDays,
    color: "#fbbf24",
  },
  {
    id: "campaign_analysis",
    label: "Campaign Analysis",
    desc: "Трекінг кампаній: план vs факт",
    block: "Tracking & Reports",
    defaultModel: { anthropic: "Claude Sonnet 4.6", openai: "GPT-4o" },
    icon: LineChart,
    color: "#fb923c",
  },
  {
    id: "weekly_report",
    label: "Weekly Report",
    desc: "PM Report + Marketing Brief щопʼятниці",
    block: "Tracking & Reports",
    defaultModel: { anthropic: "Claude Sonnet 4.6", openai: "GPT-4o" },
    icon: FileText,
    color: "#fb923c",
  },
] as const;

const LS_KEY = "mxmt_agent_providers";

export function loadAgentProviders(): Record<string, AgentProvider> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getAgentProvider(agentId: string): AgentProvider {
  const map = loadAgentProviders();
  return map[agentId] ?? "anthropic";
}

const BLOCKS = ["Core Analytics", "Decision Support", "Execution", "Tracking & Reports"] as const;
const BLOCK_COLORS: Record<string, string> = {
  "Core Analytics": "#00e5c4",
  "Decision Support": "#a78bfa",
  "Execution": "#fbbf24",
  "Tracking & Reports": "#fb923c",
};

export default function AgentProvidersCard() {
  const [providers, setProviders] = useState<Record<string, AgentProvider>>({});

  useEffect(() => {
    setProviders(loadAgentProviders());
  }, []);

  function toggle(agentId: string, p: AgentProvider) {
    const next = { ...providers, [agentId]: p };
    setProviders(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("mxmt_providers_changed"));
  }

  return (
    <div className="space-y-6">
      {BLOCKS.map((block) => {
        const agents = AGENT_CONFIGS.filter((a) => a.block === block);
        const color = BLOCK_COLORS[block];
        return (
          <div key={block}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span
                className="text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded-full border"
                style={{ color, borderColor: color + "40", background: color + "10" }}
              >
                {block}
              </span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <div className="space-y-2">
              {agents.map((agent) => {
                const Icon = agent.icon;
                const current = providers[agent.id] ?? "anthropic";
                return (
                  <div
                    key={agent.id}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4"
                    style={{ borderLeft: `3px solid ${agent.color}` }}
                  >
                    {/* Icon + info */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: agent.color + "15" }}
                    >
                      <Icon size={15} style={{ color: agent.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-[var(--text)]">{agent.label}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{agent.desc}</div>
                      <div className="text-[10px] font-mono text-[var(--subtle)] mt-0.5">
                        {current === "anthropic" ? agent.defaultModel.anthropic : agent.defaultModel.openai}
                      </div>
                    </div>

                    {/* Provider toggle */}
                    <div className="flex items-center gap-1 bg-[var(--row)] border border-[var(--border)] rounded-lg p-1 flex-shrink-0">
                      {(["anthropic", "openai"] as AgentProvider[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => toggle(agent.id, p)}
                          className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold transition-all ${
                            current === p
                              ? "bg-[var(--surface2)] text-[var(--text)] shadow-sm"
                              : "text-[var(--subtle)] hover:text-[var(--muted)]"
                          }`}
                        >
                          {p === "anthropic" ? "Anthropic" : "OpenAI"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] font-mono text-[var(--subtle)] pt-2">
        Вибір зберігається в браузері. Для роботи потрібні API ключі:{" "}
        <span className="text-[var(--muted)]">ANTHROPIC_API_KEY</span> и{" "}
        <span className="text-[var(--muted)]">OPENAI_API_KEY</span> у змінних середовища хостингу.
      </p>
    </div>
  );
}
