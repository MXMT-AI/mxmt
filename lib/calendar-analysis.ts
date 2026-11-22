import { formatMessage } from "@/i18n/format-message";
import { calendarAnalysisMessages as ukrainianCopy } from "@/messages/uk.json";

export type CalendarEventInput = {
  weekKey: string;
  rowKey: string;
  type: string;
  label: string;
  brandId?: string | null;
  channel?: string | null;
  recommendationKey?: string | null;
};

export type CalendarAnnotation = {
  id: string;
  type: "suggestion" | "conflict" | "ok";
  channel: "smm" | "email" | "ads" | "store" | "marketplace" | "general";
  brand: string;
  message: string;
  priority: "high" | "medium" | "low";
  suggested_action: string;
};

type MarketerChannel = {
  action_needed?: unknown;
};

type MarketerBrand = {
  brand_id?: unknown;
  brand_name?: unknown;
  decision_summary?: unknown;
  channels?: unknown;
};

export type CalendarAnalysis = {
  week: string;
  annotations: CalendarAnnotation[];
  planning_recommendations: Array<{
    recommendation_id: string;
    brand_id: string;
    brand_name: string;
    decision_summary: string;
    channels: CalendarAnnotation["channel"][];
    status: "draft" | "scheduled";
    events: CalendarEventInput[];
  }>;
  scheduled_campaigns: Array<{
    brand_id: string;
    brand_name: string;
    decision_summary: string;
    channels: CalendarAnnotation["channel"][];
    events: CalendarEventInput[];
  }>;
  health_score: {
    coverage_percent: number;
    scheduled_recommendations: number;
    recommendation_count: number;
    draft_recommendations: number;
    calendar_events: number;
    critical_issues: number;
    high_issues: number;
    critical_gaps: number;
    high_gaps: number;
    total_annotations: number;
    summary: string;
  };
  summary: string;
};

const KNOWN_CHANNELS = ["smm", "email", "ads", "store", "marketplace"] as const;

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isoWeek(dateInput: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(
    dateInput.getUTCFullYear(),
    dateInput.getUTCMonth(),
    dateInput.getUTCDate()
  ));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year, week };
}

export function calendarWindow(date: Date, weeks = 4): { label: string; weekKeys: string[] } {
  const current = isoWeek(date);
  const weekKeys = Array.from({ length: weeks }, (_, index) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + index * 7);
    return `w${isoWeek(next).week}`;
  });
  return {
    label: `${current.year}-W${String(current.week).padStart(2, "0")}`,
    weekKeys: [...new Set(weekKeys)],
  };
}

function parseRecommendations(marketerOutput: unknown) {
  if (!marketerOutput || typeof marketerOutput !== "object") return [];
  const brands = (marketerOutput as { brands?: unknown }).brands;
  if (!Array.isArray(brands)) return [];

  return brands.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const brand = value as MarketerBrand;
    const brandName = typeof brand.brand_name === "string" && brand.brand_name.trim()
      ? brand.brand_name.trim()
      : ukrainianCopy.brandNameБезБренду;
    const brandId = typeof brand.brand_id === "string" && brand.brand_id.trim()
      ? brand.brand_id.trim()
      : `brand-${index + 1}`;
    const decisionSummary = typeof brand.decision_summary === "string" && brand.decision_summary.trim()
      ? brand.decision_summary.trim()
      : ukrainianCopy.decisionSummaryМаркетинговаРекомендаціяПотребуєПеревірки;
    const channelData = brand.channels && typeof brand.channels === "object"
      ? brand.channels as Record<string, MarketerChannel>
      : {};
    const channels = KNOWN_CHANNELS.filter((channel) => channelData[channel]?.action_needed === true);

    return [{ brandId, brandName, decisionSummary, channels }];
  });
}

function eventChannel(rowKey: string): CalendarAnnotation["channel"] {
  if (/^ads\d*$/i.test(rowKey)) return "ads";
  if (/^smm\d*$/i.test(rowKey) || rowKey === "accent") return "smm";
  if (rowKey === "promo") return "store";
  return "general";
}

function conflictAnnotations(events: CalendarEventInput[]): CalendarAnnotation[] {
  const groups = new Map<string, CalendarEventInput[]>();
  for (const event of events) {
    const key = `${event.weekKey}:${event.rowKey}:${normalizeText(event.label)}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  return [...groups.values()].flatMap((grouped, index) => {
    if (grouped.length < 2) return [];
    const [first] = grouped;
    return [{
      id: `conflict-${index + 1}`,
      type: "conflict" as const,
      channel: eventChannel(first.rowKey),
      brand: ukrainianCopy.brandКалендар,
      message: formatMessage(ukrainianCopy.messageРядокПодію, { weekKey: first.weekKey, rowKey: first.rowKey, label: first.label, length: grouped.length }),
      priority: "high" as const,
      suggested_action: ukrainianCopy.suggestedActionПеревіритиДублікатиЙЗалишитиВ,
    }];
  });
}

export function buildCalendarAnalysis({
  now,
  events,
  marketerOutput,
}: {
  now: Date;
  events: CalendarEventInput[];
  marketerOutput: unknown;
}): CalendarAnalysis {
  const { label: week } = calendarWindow(now);
  const recommendations = parseRecommendations(marketerOutput);
  const searchableEvents = events.map((event) => ({
    event,
    label: normalizeText(event.label),
  }));

  let scheduledRecommendations = 0;
  const scheduledCampaigns: CalendarAnalysis["scheduled_campaigns"] = [];
  const planningRecommendations: CalendarAnalysis["planning_recommendations"] = [];
  const recommendationAnnotations: CalendarAnnotation[] = recommendations.map((recommendation) => {
    const brandNeedle = normalizeText(recommendation.brandName);
    const matchingEvents = searchableEvents.filter(({ event, label }) =>
      event.brandId === recommendation.brandId || (brandNeedle ? label.includes(brandNeedle) : false)
    );
    const channelList = recommendation.channels.length > 0
      ? recommendation.channels.join(", ")
      : ukrainianCopy.channelListЗагальніАктивності;
    const channel = recommendation.channels.length === 1 ? recommendation.channels[0] : "general";

    if (matchingEvents.length > 0) {
      scheduledRecommendations += 1;
      planningRecommendations.push({
        recommendation_id: `recommendation-${recommendation.brandId}`,
        brand_id: recommendation.brandId,
        brand_name: recommendation.brandName,
        decision_summary: recommendation.decisionSummary,
        channels: recommendation.channels,
        status: "scheduled",
        events: matchingEvents.map(({ event }) => event),
      });
      scheduledCampaigns.push({
        brand_id: recommendation.brandId,
        brand_name: recommendation.brandName,
        decision_summary: recommendation.decisionSummary,
        channels: recommendation.channels,
        events: matchingEvents.map(({ event }) => event),
      });
      return {
        id: `recommendation-${recommendation.brandId}`,
        type: "ok",
        channel,
        brand: recommendation.brandName,
        message: formatMessage(ukrainianCopy.messageРекомендаціяПредставленаВ, { decisionSummary: recommendation.decisionSummary, value2: matchingEvents.map(({ event }) => `${event.weekKey}: ${event.label}`).join("; ") }),
        priority: "low",
        suggested_action: formatMessage(ukrainianCopy.suggestedActionПеревіритиЩоПогодженийПланОхоплює, { channelList }),
      };
    }

    const budgetNote = recommendation.channels.includes("ads")
      ? ukrainianCopy.budgetNoteРекламнийБюджетПотрібноПогодитиОкремо
      : "";
    planningRecommendations.push({
      recommendation_id: `recommendation-${recommendation.brandId}`,
      brand_id: recommendation.brandId,
      brand_name: recommendation.brandName,
      decision_summary: recommendation.decisionSummary,
      channels: recommendation.channels,
      status: "draft",
      events: [],
    });
    return {
      id: `recommendation-${recommendation.brandId}`,
      type: "suggestion",
      channel,
      brand: recommendation.brandName,
      message: formatMessage(ukrainianCopy.messageРекомендаціяЩеНе, { decisionSummary: recommendation.decisionSummary }),
      priority: "medium",
      suggested_action: formatMessage(ukrainianCopy.suggestedActionПереглянутиЗPMІПісля, { channelList, budgetNote }),
    };
  });

  const conflicts = conflictAnnotations(events);
  const recommendationCount = recommendations.length;
  const draftRecommendations = recommendationCount - scheduledRecommendations;
  const coveragePercent = recommendationCount > 0
    ? Math.round((scheduledRecommendations / recommendationCount) * 100)
    : 0;
  const criticalIssues = 0;
  const highIssues = conflicts.filter((annotation) => annotation.priority === "high").length;

  let summary: string;
  if (recommendationCount === 0 && events.length === 0) {
    summary = ukrainianCopy.уКалендаріНемаєПодійА;
  } else if (recommendationCount === 0) {
    summary = formatMessage(ukrainianCopy.уКалендаріЄПодійНових, { length: events.length });
  } else if (draftRecommendations === 0) {
    summary = formatMessage(ukrainianCopy.усіРекомендаційПредставленіВКалендарі, { recommendationCount });
  } else {
    summary = formatMessage(ukrainianCopy.ізРекомендаційПредставленіВКалендарі, { scheduledRecommendations, recommendationCount, draftRecommendations });
  }
  if (highIssues > 0) summary += formatMessage(ukrainianCopy.знайденоМожливихКонфліктівМіжУже, { highIssues });

  const annotations = [...conflicts, ...recommendationAnnotations];
  return {
    week,
    annotations,
    planning_recommendations: planningRecommendations,
    scheduled_campaigns: scheduledCampaigns,
    health_score: {
      coverage_percent: coveragePercent,
      scheduled_recommendations: scheduledRecommendations,
      recommendation_count: recommendationCount,
      draft_recommendations: draftRecommendations,
      calendar_events: events.length,
      critical_issues: criticalIssues,
      high_issues: highIssues,
      critical_gaps: criticalIssues,
      high_gaps: highIssues,
      total_annotations: annotations.length,
      summary,
    },
    summary,
  };
}
