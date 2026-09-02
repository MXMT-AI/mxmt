import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";
import { startAgentRun } from "@/lib/agent-runs";
import { getCurrentDependencyRun, resolveAgentRunContext } from "@/lib/agent-dependencies";
import { buildCalendarAnalysis, calendarWindow } from "@/lib/calendar-analysis";

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
  const marketerState = await getCurrentDependencyRun(tenantId, "commercial_marketer", context);
  if (!marketerState.ready) {
    return apiError(
      "Спочатку запустіть Commercial Marketer для поточного імпорту та періоду.",
      409,
      "AGENT_DEPENDENCY_NOT_READY",
      [`Commercial Marketer: ${marketerState.reason}`]
    );
  }

  const { run, response: runResponse } = await startAgentRun({
    tenantId,
    agentType: "calendar_agent",
    input: { provider: providerOverride ?? "openai", asOf: body.asOf ?? null, dateFrom: body.dateFrom ?? null },
  });
  if (runResponse) return runResponse;

  try {
    const now = asOf ?? new Date();
    const { weekKeys } = calendarWindow(now);

    const calendarEvents = await prisma.marketingEvent.findMany({
      where: { tenantId, weekKey: { in: weekKeys } },
      orderBy: { weekKey: "asc" },
    });
    const marketerRun = marketerState.run;
    const output: Record<string, any> = buildCalendarAnalysis({
      now,
      events: calendarEvents,
      marketerOutput: marketerRun?.output,
    });

    // Attach raw data for context
    output.calendarEventCount = calendarEvents.length;
    output.weeksAnalyzed = weekKeys;

    output._debug = {
      analysisMode: "deterministic-planning-guardrails",
      provider: providerOverride ?? "openai",
      model: "rules-v1",
      parsedSuccessfully: true,
      calendarEventCount: calendarEvents.length,
      weeksAnalyzed: weekKeys,
      asOf: body.asOf ?? null,
      dateFrom: body.dateFrom ?? null,
      analyzedAt: new Date().toISOString(),
    };

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "done", output, finishedAt: new Date() } });
    return NextResponse.json({ runId: run.id, ...output });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "error", errorMsg: msg, finishedAt: new Date() } });
    return serverError(msg);
  }
}
