type CalendarCampaign = {
  brand_id?: unknown;
  brand_name?: unknown;
  decision_summary?: unknown;
  events?: unknown;
};

type CalendarEvent = {
  weekKey?: unknown;
  rowKey?: unknown;
  type?: unknown;
  label?: unknown;
};

export type TrackedCampaign = {
  campaign_id: string;
  brand_id: string;
  brand_name: string;
  status: "insufficient_data";
  days_running: null;
  performance_score: null;
  planned_action: string;
  actual_observation: string;
  next_action: string;
  urgency: "medium";
  calendar_events: Array<{
    weekKey: string;
    rowKey: string;
    type: string;
    label: string;
  }>;
};

export type CampaignTrackingOutput = {
  analysis_date: string;
  campaigns: TrackedCampaign[];
  overall_health: "not_started" | "insufficient_data";
  active_campaign_count: 0;
  scheduled_campaign_count: number;
  pending_recommendations: number;
  recommendation_count: number;
  summary: string;
  message: string;
};

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function cleanEvents(value: unknown): TrackedCampaign["calendar_events"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const event = entry as CalendarEvent;
    if (
      typeof event.weekKey !== "string" ||
      typeof event.rowKey !== "string" ||
      typeof event.type !== "string" ||
      typeof event.label !== "string"
    ) return [];
    return [{
      weekKey: event.weekKey,
      rowKey: event.rowKey,
      type: event.type,
      label: event.label,
    }];
  });
}

function calendarCampaigns(calendarOutput: unknown): CalendarCampaign[] {
  if (!calendarOutput || typeof calendarOutput !== "object") return [];
  const campaigns = (calendarOutput as { scheduled_campaigns?: unknown }).scheduled_campaigns;
  return Array.isArray(campaigns)
    ? campaigns.filter((entry): entry is CalendarCampaign => Boolean(entry) && typeof entry === "object")
    : [];
}

export function buildCampaignTrackingOutput({
  now,
  calendarOutput,
}: {
  now: Date;
  calendarOutput: unknown;
}): CampaignTrackingOutput {
  const outputRecord = calendarOutput && typeof calendarOutput === "object"
    ? calendarOutput as Record<string, unknown>
    : {};
  const health = outputRecord.health_score && typeof outputRecord.health_score === "object"
    ? outputRecord.health_score as Record<string, unknown>
    : {};
  const scheduled = calendarCampaigns(calendarOutput);
  const annotations = Array.isArray(outputRecord.annotations) ? outputRecord.annotations : [];
  const recommendationCount = nonNegativeInteger(health.recommendation_count)
    ?? annotations.filter((entry) => Boolean(entry) && typeof entry === "object" && ["suggestion", "ok"].includes(String((entry as Record<string, unknown>).type))).length;
  const pendingRecommendations = nonNegativeInteger(health.draft_recommendations)
    ?? annotations.filter((entry) => Boolean(entry) && typeof entry === "object" && (entry as Record<string, unknown>).type === "suggestion").length;

  const campaigns = scheduled.flatMap((campaign, index): TrackedCampaign[] => {
    if (typeof campaign.brand_name !== "string" || !campaign.brand_name.trim()) return [];
    const brandId = typeof campaign.brand_id === "string" && campaign.brand_id.trim()
      ? campaign.brand_id.trim()
      : `brand-${index + 1}`;
    const plannedAction = typeof campaign.decision_summary === "string" && campaign.decision_summary.trim()
      ? campaign.decision_summary.trim()
      : "Погоджена маркетингова активність";
    const events = cleanEvents(campaign.events);
    const eventDescription = events.length > 0
      ? events.map((event) => `${event.weekKey}: ${event.label}`).join("; ")
      : "подію додано до календаря";

    return [{
      campaign_id: `camp_${brandId}`,
      brand_id: brandId,
      brand_name: campaign.brand_name.trim(),
      status: "insufficient_data",
      days_running: null,
      performance_score: null,
      planned_action: plannedAction,
      actual_observation: `У календарі: ${eventDescription}. Немає підтвердженої дати фактичного запуску та метрик після старту.`,
      next_action: "Після запуску зафіксувати фактичну дату й дочекатися нових продажів перед оцінкою ефективності.",
      urgency: "medium",
      calendar_events: events,
    }];
  });

  const scheduledCount = campaigns.length;
  const summary = scheduledCount === 0
    ? `Активних кампаній немає. ${pendingRecommendations} із ${recommendationCount} рекомендацій очікують погодження та додавання до календаря.`
    : `${scheduledCount} рекомендацій представлені в календарі, але оцінювати їхню ефективність ще рано: немає підтвердження фактичного запуску та даних після старту. ${pendingRecommendations} рекомендацій ще очікують погодження.`;

  return {
    analysis_date: now.toISOString().slice(0, 10),
    campaigns,
    overall_health: scheduledCount === 0 ? "not_started" : "insufficient_data",
    active_campaign_count: 0,
    scheduled_campaign_count: scheduledCount,
    pending_recommendations: pendingRecommendations,
    recommendation_count: recommendationCount,
    summary,
    message: summary,
  };
}
