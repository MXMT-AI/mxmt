import { prisma } from "@/lib/prisma";
import { getActiveAgentImportRunId } from "@/lib/agent-data-source";
import {
  buildAgentRunContext,
  selectCurrentDependencyRun,
  type AgentRunContext,
} from "@/lib/agent-context";

export async function resolveAgentRunContext(
  tenantId: string,
  input: { asOf?: unknown; dateFrom?: unknown }
): Promise<AgentRunContext> {
  const importRunId = await getActiveAgentImportRunId(tenantId);
  return buildAgentRunContext({ ...input, importRunId });
}

export async function getCurrentDependencyRun(
  tenantId: string,
  agentType: string,
  context: AgentRunContext
) {
  const runs = await prisma.agentRun.findMany({
    where: { tenantId, agentType },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return selectCurrentDependencyRun(runs, context);
}
