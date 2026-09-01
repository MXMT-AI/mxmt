import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeStaleAgentRuns } from "@/lib/agent-runs";
import { requireApiUser } from "@/lib/server-auth";
import { resolveAgentRunContext } from "@/lib/agent-dependencies";
import { selectCurrentDependencyRun } from "@/lib/agent-context";

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
      const state = selectCurrentDependencyRun(agentRuns, context);
      const run = state.run ?? agentRuns[0];
      return run
        ? [[agentType, {
            ...run,
            isCurrent: state.run?.id === run.id,
            staleReason: state.run?.id === run.id ? null : state.reason,
          }]]
        : [];
    })
  );

  return NextResponse.json(latest);
}
