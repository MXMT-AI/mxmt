import {
  BarChart2, TrendingDown, TrendingUp, Tag, ShoppingCart,
  Megaphone, CalendarDays, LineChart, FileText,
} from "lucide-react";
import { settingsAgentProvidersCardAgentProviderConfigMessages as englishCopy } from "@/messages/en.json";
import { settingsAgentProvidersCardAgentProviderConfigMessages as ukrainianCopy } from "@/messages/uk.json";

export const AGENT_CONFIGS = [
  {
    id: "inventory_analyst",
    label: englishCopy.labelInventoryAnalyst,
    desc: ukrainianCopy.descСтатусБрендівCRITICALWARNING,
    block: englishCopy.blockCoreAnalytics,
    defaultModel: { anthropic: englishCopy.anthropicClaudeSonnet46, openai: "GPT-4o" },
    icon: BarChart2,
    color: "#00e5c4",
  },
  {
    id: "channel_analytics",
    label: englishCopy.labelChannelAnalytics,
    desc: ukrainianCopy.descПорівнянняКаналівПродажів,
    block: englishCopy.blockCoreAnalytics,
    defaultModel: { anthropic: englishCopy.anthropicClaudeHaiku45, openai: englishCopy.openaiGPT4oMini },
    icon: TrendingUp,
    color: "#00e5c4",
  },
  {
    id: "product_attributes",
    label: englishCopy.labelProductAttributes,
    desc: ukrainianCopy.descBestsellersVsМертвийСтокЗа,
    block: englishCopy.blockCoreAnalytics,
    defaultModel: { anthropic: englishCopy.anthropicClaudeHaiku45, openai: englishCopy.openaiGPT4oMini },
    icon: Tag,
    color: "#00e5c4",
  },
  {
    id: "repricing",
    label: englishCopy.labelRepricingStrategy,
    desc: ukrainianCopy.desc3ВаріантиУцінкиЗОцінкою,
    block: englishCopy.blockDecisionSupport,
    defaultModel: { anthropic: englishCopy.anthropicClaudeSonnet46, openai: "GPT-4o" },
    icon: TrendingDown,
    color: "#a78bfa",
  },
  {
    id: "reordering",
    label: englishCopy.labelReorderingStrategy,
    desc: ukrainianCopy.desc3СценаріїДозамовленняЗФінансовими,
    block: englishCopy.blockDecisionSupport,
    defaultModel: { anthropic: englishCopy.anthropicClaudeSonnet46, openai: "GPT-4o" },
    icon: ShoppingCart,
    color: "#a78bfa",
  },
  {
    id: "commercial_marketer",
    label: englishCopy.labelCommercialMarketer,
    desc: ukrainianCopy.descБрифиПо5КаналахПісля,
    block: englishCopy.blockExecution,
    defaultModel: { anthropic: englishCopy.anthropicClaudeSonnet46, openai: "GPT-4o" },
    icon: Megaphone,
    color: "#fbbf24",
  },
  {
    id: "calendar_agent",
    label: englishCopy.labelCalendarAgent,
    desc: ukrainianCopy.descGapsІКонфліктиВМаркетинговому,
    block: englishCopy.blockExecution,
    defaultModel: { anthropic: englishCopy.anthropicClaudeHaiku45, openai: englishCopy.openaiGPT4oMini },
    icon: CalendarDays,
    color: "#fbbf24",
  },
  {
    id: "campaign_analysis",
    label: englishCopy.labelCampaignAnalysis,
    desc: ukrainianCopy.descТрекінгКампанійПланVsФакт,
    block: englishCopy.blockTrackingReports,
    defaultModel: { anthropic: englishCopy.anthropicClaudeSonnet46, openai: "GPT-4o" },
    icon: LineChart,
    color: "#fb923c",
  },
  {
    id: "weekly_report",
    label: englishCopy.labelWeeklyReport,
    desc: ukrainianCopy.descPMReportMarketingBrief,
    block: englishCopy.blockTrackingReports,
    defaultModel: { anthropic: englishCopy.anthropicClaudeSonnet46, openai: "GPT-4o" },
    icon: FileText,
    color: "#fb923c",
  },
] as const;

export const BLOCKS = [englishCopy.blockCoreAnalytics, englishCopy.blockDecisionSupport, englishCopy.blockExecution, englishCopy.blockTrackingReports] as const;
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
