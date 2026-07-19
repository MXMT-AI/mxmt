import {
  BarChart2,
  CalendarDays,
  FileText,
  LineChart,
  Megaphone,
  ShoppingCart,
  Tag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AgentBlock, AgentDefinition } from "@/components/agents/agents.types";

export const AGENTS: AgentDefinition[] = [
  {
    id: "inventory_analyst", label: "Inventory Analyst", model: "Sonnet",
    block: 1, blockLabel: "Core Analytics", desc: "Статус кожного бренда по WOH, STR, GM, Trend",
    icon: BarChart2, color: "#00e5c4", runnable: true,
    dependsOn: [],
  },
  {
    id: "channel_analytics", label: "Channel Analytics", model: "Haiku",
    block: 1, blockLabel: "Core Analytics", desc: "Порівняння каналів продажів (онлайн / офлайн)",
    icon: TrendingUp, color: "#00e5c4", runnable: true,
    dependsOn: [],
  },
  {
    id: "product_attributes", label: "Product Attributes", model: "Haiku",
    block: 1, blockLabel: "Core Analytics", desc: "Bestsellers vs мертвий сток по категоріях",
    icon: Tag, color: "#00e5c4", runnable: true,
    dependsOn: [],
  },
  {
    id: "repricing", label: "Repricing Strategy", model: "Sonnet",
    block: 2, blockLabel: "Decision Support", desc: "3 варіанти уцінки для брендів з високим WOH",
    icon: TrendingDown, color: "#a78bfa", runnable: true,
    dependsOn: ["inventory_analyst"],
  },
  {
    id: "reordering", label: "Reordering Strategy", model: "Sonnet",
    block: 2, blockLabel: "Decision Support", desc: "3 сценарії дозамовлення для брендів з низьким WOH",
    icon: ShoppingCart, color: "#a78bfa", runnable: true,
    dependsOn: ["inventory_analyst"],
  },
  {
    id: "commercial_marketer", label: "Commercial Marketer", model: "Sonnet",
    block: 3, blockLabel: "Execution", desc: "Брифи по 5 каналах після рішення PM",
    icon: Megaphone, color: "#fbbf24", runnable: true,
    dependsOn: ["repricing", "reordering"],
  },
  {
    id: "calendar_agent", label: "Calendar Agent", model: "Haiku",
    block: 3, blockLabel: "Execution", desc: "Gaps і конфлікти в маркетинговому плані",
    icon: CalendarDays, color: "#fbbf24", runnable: true,
    dependsOn: ["commercial_marketer"],
  },
  {
    id: "campaign_analysis", label: "Campaign Analysis", model: "Sonnet",
    block: 4, blockLabel: "Tracking & Reports", desc: "Трекінг кампаній план vs факт",
    icon: LineChart, color: "#fb923c", runnable: true,
    dependsOn: ["commercial_marketer"],
  },
  {
    id: "weekly_report", label: "Weekly Report", model: "Sonnet",
    block: 4, blockLabel: "Tracking & Reports", desc: "PM Report + Marketing Brief щопʼятниці",
    icon: FileText, color: "#fb923c", runnable: true,
    dependsOn: ["campaign_analysis"],
  },
];

export const BLOCKS: AgentBlock[] = [
  { id: 1, label: "Core Analytics", color: "#00e5c4", desc: "Автоматично кожного ранку" },
  { id: 2, label: "Decision Support", color: "#a78bfa", desc: "За запитом PM" },
  { id: 3, label: "Execution", color: "#fbbf24", desc: "Після вибору PM" },
  { id: 4, label: "Tracking & Reports", color: "#fb923c", desc: "Авто-трекінг" },
];

export const AGENT_ROUTES: Record<string, string> = {
  inventory_analyst: "/api/agents/inventory-analyst",
  channel_analytics: "/api/agents/channel-analytics",
  product_attributes: "/api/agents/product-attributes",
  repricing: "/api/agents/repricing",
  reordering: "/api/agents/reordering",
  commercial_marketer: "/api/agents/commercial-marketer",
  calendar_agent: "/api/agents/calendar-agent",
  campaign_analysis: "/api/agents/campaign-analysis",
  weekly_report: "/api/agents/weekly-report",
};

export const COMING_SOON: Record<string, string> = {};
