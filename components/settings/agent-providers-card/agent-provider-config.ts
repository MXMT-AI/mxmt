import {
  BarChart2, TrendingDown, TrendingUp, Tag, ShoppingCart,
  Megaphone, CalendarDays, LineChart, FileText,
} from "lucide-react";

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

export const BLOCKS = ["Core Analytics", "Decision Support", "Execution", "Tracking & Reports"] as const;
export const BLOCK_COLORS: Record<string, string> = {
  "Core Analytics": "#00e5c4",
  "Decision Support": "#a78bfa",
  "Execution": "#fbbf24",
  "Tracking & Reports": "#fb923c",
};

export type AgentProviderConfig = (typeof AGENT_CONFIGS)[number];

export const agentProviderGroups = BLOCKS.map(block => ({
  block, color: BLOCK_COLORS[block], agents: AGENT_CONFIGS.filter(agent => agent.block === block),
}));
