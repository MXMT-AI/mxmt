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
  email: { rowKey: "comm", type: "agent", label: "Email" },
  ads: { rowKey: "ads1", type: "promo", label: "Реклама" },
  store: { rowKey: "promo", type: "promo", label: "Магазин" },
  marketplace: { rowKey: "focus", type: "agent", label: "Маркетплейс" },
  general: { rowKey: "focus", type: "agent", label: "Загальний план" },
  website: { rowKey: "ban1", type: "agent", label: "Сайт" },
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
