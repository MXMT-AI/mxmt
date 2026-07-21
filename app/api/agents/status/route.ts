import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeStaleAgentRuns } from "@/lib/agent-runs";
import { requireApiUser } from "@/lib/server-auth";

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

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  await closeStaleAgentRuns(tenantId);

  const runs = await prisma.agentRun.findMany({
    where: { tenantId, agentType: { in: AGENT_TYPES } },
    orderBy: { startedAt: "desc" },
  });

  const latest = Object.fromEntries(
    AGENT_TYPES.flatMap((agentType) => {
      const run = runs.find((item) => item.agentType === agentType);
      return run ? [[agentType, run]] : [];
    })
  );

  return NextResponse.json(latest);
}
