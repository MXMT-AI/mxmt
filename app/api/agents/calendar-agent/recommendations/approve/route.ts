import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody, serverError, stringField, validationError } from "@/lib/api-contracts";
import { buildAgentRunContext } from "@/lib/agent-context";
import { getCurrentDependencyRun } from "@/lib/agent-dependencies";
import {
  buildRecommendationCalendarEvents,
  isRecommendationChannel,
  type CalendarRecommendation,
  type RecommendationChannel,
} from "@/lib/calendar-recommendation-approval";

export const runtime = "nodejs";

function readRecommendations(output: unknown): CalendarRecommendation[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const recommendations = (output as Record<string, unknown>).planning_recommendations;
  if (!Array.isArray(recommendations)) return [];
  return recommendations.filter((value): value is CalendarRecommendation => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const recommendation = value as Record<string, unknown>;
    return (
      typeof recommendation.recommendation_id === "string" &&
      typeof recommendation.brand_id === "string" &&
      typeof recommendation.brand_name === "string" &&
      typeof recommendation.decision_summary === "string" &&
      Array.isArray(recommendation.channels) &&
      recommendation.channels.every(isRecommendationChannel) &&
      (recommendation.status === "draft" || recommendation.status === "scheduled")
    );
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId, userId } = user;

  const { data, response: parseResponse } = await parseJsonBody(request);
  if (parseResponse) return parseResponse;
  if (!isRecord(data)) return validationError(["body must be an object"]);

  const issues: string[] = [];
  const calendarRunId = stringField(data, "calendarRunId", issues, { required: true, maxLength: 64 });
  const recommendationId = stringField(data, "recommendationId", issues, { required: true, maxLength: 160 });
  const weekKey = stringField(data, "weekKey", issues, { required: true, maxLength: 16 });
  const rawChannels = data.channels;
  const channels: RecommendationChannel[] = Array.isArray(rawChannels)
    ? rawChannels.filter(isRecommendationChannel)
    : [];

  if (weekKey && !/^w(?:[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
    issues.push("weekKey must be an ISO week key from w1 to w53");
  }
  if (!Array.isArray(rawChannels) || rawChannels.length === 0 || channels.length !== rawChannels.length) {
    issues.push("channels must be a non-empty array of supported channels");
  }
  if (issues.length > 0) return validationError(issues);

  try {
    const calendarRun = await prisma.agentRun.findFirst({
      where: { id: calendarRunId!, tenantId, agentType: "calendar_agent", status: "done" },
    });
    if (!calendarRun) return apiError("Запуск Calendar Agent не знайдено.", 404, "CALENDAR_RUN_NOT_FOUND");

    const context = buildAgentRunContext(calendarRun.input as Record<string, unknown>);
    const currentState = await getCurrentDependencyRun(tenantId, "calendar_agent", context);
    if (!currentState.ready || currentState.run?.id !== calendarRun.id) {
      return apiError(
        "Рекомендація застаріла. Перезапустіть Calendar Agent і погодьте актуальний план.",
        409,
        "STALE_CALENDAR_RECOMMENDATION"
      );
    }

    const recommendation = readRecommendations(calendarRun.output)
      .find((item) => item.recommendation_id === recommendationId);
    if (!recommendation) {
      return apiError("Рекомендацію не знайдено в цьому запуску Calendar Agent.", 404, "RECOMMENDATION_NOT_FOUND");
    }

    const events = buildRecommendationCalendarEvents({
      recommendation,
      weekKey: weekKey!,
      selectedChannels: channels,
    });
    if (events.length === 0) {
      return validationError(["selected channels are not part of this recommendation"]);
    }

    const recommendationKey = `${calendarRun.id}:${recommendation.recommendation_id}`;
    const approvedAt = new Date();
    const { insertedCount, savedEvents } = await prisma.$transaction(async (tx) => {
      const inserted = await tx.marketingEvent.createMany({
        data: events.map((event) => ({
          tenantId,
          ...event,
          source: "agent",
          sourceAgentRunId: calendarRun.id,
          recommendationKey,
          brandId: recommendation.brand_id,
          approvedAt,
          approvedBy: userId,
        })),
        skipDuplicates: true,
      });
      const saved = await tx.marketingEvent.findMany({
        where: { tenantId, recommendationKey },
        orderBy: { rowKey: "asc" },
      });
      return { insertedCount: inserted.count, savedEvents: saved };
    });

    return NextResponse.json({
      ok: true,
      created: insertedCount,
      recommendationId: recommendation.recommendation_id,
      events: savedEvents,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : String(error));
  }
}
