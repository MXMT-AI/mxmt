import { calendarRecommendationApprovalMessages as englishCopy } from "@/messages/en.json";
import { calendarRecommendationApprovalMessages as ukrainianCopy } from "@/messages/uk.json";

export const RECOMMENDATION_CHANNELS = ["smm", "email", "ads", "store", "marketplace", "general", "website"] as const;

export type RecommendationChannel = (typeof RECOMMENDATION_CHANNELS)[number];

export type CalendarRecommendation = {
  recommendation_id: string;
  brand_id: string;
  brand_name: string;
  decision_summary: string;
  channels: RecommendationChannel[];
  status: "draft" | "scheduled";
};

export type RecommendationCalendarEvent = {
  weekKey: string;
  rowKey: string;
  type: string;
  label: string;
  channel: RecommendationChannel;
};

const CHANNEL_CONFIG: Record<RecommendationChannel, { rowKey: string; type: string; label: string }> = {
  smm: { rowKey: "smm1", type: "agent", label: "SMM" },
  email: { rowKey: "comm", type: "agent", label: englishCopy.labelEmail },
  ads: { rowKey: "ads1", type: "promo", label: ukrainianCopy.labelРеклама },
  store: { rowKey: "promo", type: "promo", label: ukrainianCopy.labelМагазин },
  marketplace: { rowKey: "focus", type: "agent", label: ukrainianCopy.labelМаркетплейс },
  general: { rowKey: "focus", type: "agent", label: ukrainianCopy.labelЗагальнийПлан },
  website: { rowKey: "ban1", type: "agent", label: ukrainianCopy.labelСайт },
};

export function isRecommendationChannel(value: unknown): value is RecommendationChannel {
  return typeof value === "string" && RECOMMENDATION_CHANNELS.includes(value as RecommendationChannel);
}

export function buildRecommendationCalendarEvents({
  recommendation,
  weekKey,
  selectedChannels,
}: {
  recommendation: CalendarRecommendation;
  weekKey: string;
  selectedChannels: RecommendationChannel[];
}): RecommendationCalendarEvent[] {
  const allowed = new Set(recommendation.channels.length > 0 ? recommendation.channels : ["general"]);
  const channels = [...new Set(selectedChannels)].filter((channel) => allowed.has(channel));

  return channels.map((channel) => {
    const config = CHANNEL_CONFIG[channel];
    const label = `${recommendation.brand_name}: ${recommendation.decision_summary} · ${config.label}`;
    return {
      weekKey,
      rowKey: config.rowKey,
      type: config.type,
      label: label.slice(0, 160),
      channel,
    };
  });
}
