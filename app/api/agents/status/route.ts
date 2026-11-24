import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeStaleAgentRuns } from "@/lib/agent-runs";
import { requireApiUser } from "@/lib/server-auth";
import { resolveAgentRunContext } from "@/lib/agent-dependencies";
import { isAgentRunCurrent, selectAgentDisplayRun, type AgentRunContext } from "@/lib/agent-context";
import { groundWeeklyCampaignBrief, readWeeklyCampaignStatus } from "@/lib/weekly-campaign-status";

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

async function readAgentStatus(tenantId: string, context: AgentRunContext) {
  await closeStaleAgentRuns(tenantId);

  const runs = await prisma.agentRun.findMany({
    where: { tenantId, agentType: { in: AGENT_TYPES } },
    orderBy: { startedAt: "desc" },
  });
  const campaignRuns = runs.filter((run) => run.agentType === "campaign_analysis" && run.status === "done");

  return Object.fromEntries(
    AGENT_TYPES.flatMap((agentType) => {
      const agentRuns = runs.filter((item) => item.agentType === agentType);
      const { run, attempt, isCurrent } = selectAgentDisplayRun(agentRuns, context);
      const campaign = agentType === "weekly_report" && run?.status === "done" && isCurrent
        ? campaignRuns.find((candidate) => candidate.startedAt <= run.startedAt && isAgentRunCurrent(candidate, context))
        : undefined;
      return run
        ? [[agentType, {
            ...run,
            ...(campaign ? { output: groundWeeklyCampaignBrief(run.output, readWeeklyCampaignStatus(campaign.output)) } : {}),
            ...(attempt && {
              latestAttempt: { status: attempt.status, errorMsg: attempt.errorMsg },
            }),
            isCurrent,
            staleReason: isCurrent ? null : "stale",
          }]]
        : [];
    })
  );

}

const statusCache = new Map<string, {
  expiresAt: number;
  data: ReturnType<typeof readAgentStatus>;
}>();

export async function GET(req: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;
  const query = req.nextUrl.searchParams;
  const context = await resolveAgentRunContext(tenantId, {
    asOf: query.get("asOf"),
    dateFrom: query.get("dateFrom"),
  });
  const headers = { "Cache-Control": "private, no-store" };
  if (query.get("saved") !== "1" && query.get("fresh") !== "1") {
    return NextResponse.json(await readAgentStatus(tenantId, context), { headers });
  }

  const key = JSON.stringify([tenantId, context]);
  const cached = statusCache.get(key);
  if (cached && cached.expiresAt > Date.now() && query.get("fresh") !== "1")
    return NextResponse.json(await cached.data, { headers });

  statusCache.delete(key);
  if (statusCache.size >= 48) statusCache.delete(statusCache.keys().next().value!);
  const data = readAgentStatus(tenantId, context);
  statusCache.set(key, { data, expiresAt: Date.now() + 15_000 });
  try {
    return NextResponse.json(await data, { headers });
  } catch (error) {
    if (statusCache.get(key)?.data === data) statusCache.delete(key);
    throw error;
  }
}
