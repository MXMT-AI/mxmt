import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";
import { startAgentRun } from "@/lib/agent-runs";
import { getCurrentDependencyRun, resolveAgentRunContext } from "@/lib/agent-dependencies";
import { buildCampaignTrackingOutput } from "@/lib/campaign-tracking";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const providerOverride: string | undefined = body.provider ?? undefined;
  const asOf: Date | undefined = body.asOf ? new Date(body.asOf) : undefined;
  const context = await resolveAgentRunContext(tenantId, body);
  const calendarState = await getCurrentDependencyRun(tenantId, "calendar_agent", context);
  if (!calendarState.ready) {
    return apiError(
      "Спочатку запустіть Calendar Agent для поточного імпорту та періоду.",
      409,
      "AGENT_DEPENDENCY_NOT_READY",
      [`Calendar Agent: ${calendarState.reason}`]
    );
  }

  const { run, response: runResponse } = await startAgentRun({
    tenantId,
    agentType: "campaign_analysis",
    input: { provider: providerOverride ?? "openai", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const calendarRun = calendarState.run;
    const output: Record<string, any> = buildCampaignTrackingOutput({
      now: asOf ?? new Date(),
      calendarOutput: calendarRun?.output,
    });

    output.calendarRunDate = calendarRun?.startedAt ?? null;
    output.campaignCount = output.scheduled_campaign_count;
    output._debug = {
      analysisMode: "calendar-backed-tracking-guardrails",
      provider: providerOverride ?? "openai",
      model: "rules-v1",
      parsedSuccessfully: true,
      scheduledCampaignCount: output.scheduled_campaign_count,
      pendingRecommendations: output.pending_recommendations,
      asOf: body.asOf ?? null,
      dateFrom: body.dateFrom ?? null,
      analyzedAt: new Date().toISOString(),
    };

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "done", output, finishedAt: new Date() },
    });
    return NextResponse.json({ runId: run.id, ...output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "error", errorMsg: msg, finishedAt: new Date() },
    });
    return serverError(msg);
  }
}
