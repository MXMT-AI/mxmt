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
import { agentsAgentsConfigMessages as englishCopy } from "@/messages/en.json";
import { agentsAgentsConfigMessages as ukrainianCopy } from "@/messages/uk.json";

export const AGENTS: AgentDefinition[] = [
  {
    id: "inventory_analyst", label: englishCopy.labelInventoryAnalyst, model: englishCopy.modelGPT4o,
    block: 1, blockLabel: englishCopy.blockLabelCoreAnalytics, desc: ukrainianCopy.descСтатусКожногоБрендаПоWOH,
    icon: BarChart2, runnable: true,
    dependsOn: [],
  },
  {
    id: "channel_analytics", label: englishCopy.labelChannelAnalytics, model: englishCopy.modelGPT4oMini,
    block: 1, blockLabel: englishCopy.blockLabelCoreAnalytics, desc: ukrainianCopy.descПорівнянняКаналівПродажівОнлайн,
    icon: TrendingUp, runnable: true,
    dependsOn: [],
  },
  {
    id: "product_attributes", label: englishCopy.labelProductAttributes, model: englishCopy.modelGPT4oMini,
    block: 1, blockLabel: englishCopy.blockLabelCoreAnalytics, desc: ukrainianCopy.descBestsellersVsМертвийСтокПо,
    icon: Tag, runnable: true,
    dependsOn: [],
  },
  {
    id: "repricing", label: englishCopy.labelRepricingStrategy, model: englishCopy.modelGPT4o,
    block: 2, blockLabel: englishCopy.blockLabelDecisionSupport, desc: ukrainianCopy.desc3ВаріантиУцінкиДляБрендів,
    icon: TrendingDown, runnable: true,
    dependsOn: ["inventory_analyst"],
  },
  {
    id: "reordering", label: englishCopy.labelReorderingStrategy, model: englishCopy.modelGPT4o,
    block: 2, blockLabel: englishCopy.blockLabelDecisionSupport, desc: ukrainianCopy.desc3СценаріїДозамовленняДляБрендів,
    icon: ShoppingCart, runnable: true,
    dependsOn: ["inventory_analyst"],
  },
  {
    id: "commercial_marketer", label: englishCopy.labelCommercialMarketer, model: englishCopy.modelGPT4o,
    block: 3, blockLabel: englishCopy.blockLabelExecution, desc: ukrainianCopy.descБрифиПо5КаналахІз,
    icon: Megaphone, runnable: true,
    dependsOn: ["repricing", "reordering"],
  },
  {
    id: "calendar_agent", label: englishCopy.labelCalendarAgent, model: englishCopy.modelRulesV1,
    block: 3, blockLabel: englishCopy.blockLabelExecution, desc: ukrainianCopy.descЧернеткиРекомендаційІКонфліктиКалендаря,
    icon: CalendarDays, runnable: true,
    dependsOn: ["commercial_marketer"],
  },
  {
    id: "campaign_analysis", label: englishCopy.labelCampaignAnalysis, model: englishCopy.modelRulesV1,
    block: 4, blockLabel: englishCopy.blockLabelTrackingReports, desc: ukrainianCopy.descТрекінгЛишеЗапланованихКампаній,
    icon: LineChart, runnable: true,
    dependsOn: ["calendar_agent"],
  },
  {
    id: "weekly_report", label: englishCopy.labelWeeklyReport, model: englishCopy.modelGPT4o,
    block: 4, blockLabel: englishCopy.blockLabelTrackingReports, desc: ukrainianCopy.descPMReportMarketingBrief,
    icon: FileText, runnable: true,
    dependsOn: [
      "inventory_analyst", "channel_analytics", "product_attributes",
      "repricing", "reordering", "commercial_marketer", "calendar_agent", "campaign_analysis",
    ],
  },
];

export const BLOCKS: AgentBlock[] = [
  { id: 1, label: englishCopy.blockLabelCoreAnalytics, desc: ukrainianCopy.descАвтоматичноКожногоРанку },
  { id: 2, label: englishCopy.blockLabelDecisionSupport, desc: ukrainianCopy.descЗаЗапитомPM },
  { id: 3, label: englishCopy.blockLabelExecution, desc: ukrainianCopy.descПісляВалідованоїРекомендації },
  { id: 4, label: englishCopy.blockLabelTrackingReports, desc: ukrainianCopy.descАвтоТрекінг },
];

export const AGENT_BLOCKS = BLOCKS.map((block) => ({
  ...block,
  agents: AGENTS.filter((agent) => agent.block === block.id),
}));

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
