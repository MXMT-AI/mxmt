import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody, serverError, stringField, validationError } from "@/lib/api-contracts";
import { buildAgentRunContext } from "@/lib/agent-context";
import { getCurrentDependencyRun } from "@/lib/agent-dependencies";
import { approveMarketingBrief } from "@/lib/marketing-briefs";
import { aiExecutionFailure } from "@/lib/ai-execution/contracts";
import { logError } from "@/lib/observability";
import {
  buildRecommendationCalendarEvents,
  isRecommendationChannel,
  type CalendarRecommendation,
  type RecommendationChannel,
} from "@/lib/calendar-recommendation-approval";
import { apiAgentsCalendarAgentRecommendationsApproveRouteMessages as englishCopy } from "@/messages/en.json";
import { apiAgentsCalendarAgentRecommendationsApproveRouteMessages as ukrainianCopy } from "@/messages/uk.json";

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
  if (!isRecord(data)) return validationError([englishCopy.bodyMustBeAnObject]);
  if (data.mode === "marketing_v2") {
    const {mode:_,...command}=data;
    try{return NextResponse.json(await approveMarketingBrief({tenantId,userId},command),{headers:{"Cache-Control":"no-store"}});}
    catch(error){const failure=aiExecutionFailure(error);if(failure.status>=500)logError("Marketing approval failed",failure.cause??failure,{tenantId});return apiError(failure.code,failure.status,failure.code);}
  }
  if (data.mode !== undefined) return apiError(englishCopy.unsupportedApprovalMode,400,"AI_INVALID_INPUT");

  const issues: string[] = [];
  const calendarRunId = stringField(data, "calendarRunId", issues, { required: true, maxLength: 64 });
  const recommendationId = stringField(data, "recommendationId", issues, { required: true, maxLength: 160 });
  const weekKey = stringField(data, "weekKey", issues, { required: true, maxLength: 16 });
  const rawChannels = data.channels;
  const channels: RecommendationChannel[] = Array.isArray(rawChannels)
    ? rawChannels.filter(isRecommendationChannel)
    : [];

  if (weekKey && !/^w(?:[1-9]|[1-4]\d|5[0-3])$/.test(weekKey)) {
    issues.push(englishCopy.weekKeyMustBeAnISOWeek);
  }
  if (!Array.isArray(rawChannels) || rawChannels.length === 0 || channels.length !== rawChannels.length) {
    issues.push(englishCopy.channelsMustBeANonEmptyArray);
  }
  if (issues.length > 0) return validationError(issues);

  try {
    const calendarRun = await prisma.agentRun.findFirst({
      where: { id: calendarRunId!, tenantId, agentType: "calendar_agent", status: "done" },
    });
    if (!calendarRun) return apiError(ukrainianCopy.запускCalendarAgentНеЗнайдено, 404, "CALENDAR_RUN_NOT_FOUND");

    const context = buildAgentRunContext(calendarRun.input as Record<string, unknown>);
    const currentState = await getCurrentDependencyRun(tenantId, "calendar_agent", context);
    if (!currentState.ready || currentState.run?.id !== calendarRun.id) {
      return apiError(
        ukrainianCopy.рекомендаціяЗастарілаПерезапустітьCalendarAgent,
        409,
        "STALE_CALENDAR_RECOMMENDATION"
      );
    }

    const recommendation = readRecommendations(calendarRun.output)
      .find((item) => item.recommendation_id === recommendationId);
    if (!recommendation) {
      return apiError(ukrainianCopy.рекомендаціюНеЗнайденоВЦьому, 404, "RECOMMENDATION_NOT_FOUND");
    }

    const events = buildRecommendationCalendarEvents({
      recommendation,
      weekKey: weekKey!,
      selectedChannels: channels,
    });
    if (events.length === 0) {
      return validationError([englishCopy.selectedChannelsAreNotPart]);
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
