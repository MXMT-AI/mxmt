import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeStaleAgentRuns } from "@/lib/agent-runs";
import { requireApiUser } from "@/lib/server-auth";
import { resolveAgentRunContext } from "@/lib/agent-dependencies";
import { selectAgentDisplayRun } from "@/lib/agent-context";

export const runtime = "nodejs";

const AGENT_TYPES = [
  "inventory_analyst",
  "channel_analytics",
  "product_attributes",
  "repricing",
  "reordering",
  "commercial_marketer",
  "calendar_agent",
  "campaign_analysis",
  "weekly_report",
];

export async function GET(req: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;
  const context = await resolveAgentRunContext(tenantId, {
    asOf: req.nextUrl.searchParams.get("asOf"),
    dateFrom: req.nextUrl.searchParams.get("dateFrom"),
  });

  await closeStaleAgentRuns(tenantId);

  const runs = await prisma.agentRun.findMany({
    where: { tenantId, agentType: { in: AGENT_TYPES } },
    orderBy: { startedAt: "desc" },
  });

  const latest = Object.fromEntries(
    AGENT_TYPES.flatMap((agentType) => {
      const agentRuns = runs.filter((item) => item.agentType === agentType);
      const { run, attempt, isCurrent } = selectAgentDisplayRun(agentRuns, context);
      return run
        ? [[agentType, {
            ...run,
            ...(attempt && {
              latestAttempt: { status: attempt.status, errorMsg: attempt.errorMsg },
            }),
            isCurrent,
            staleReason: isCurrent ? null : "stale",
          }]]
        : [];
    })
  );

  return NextResponse.json(latest);
}
