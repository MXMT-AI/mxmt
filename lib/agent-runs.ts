import { AgentRun, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-contracts";

interface StartAgentRunInput {
  tenantId: string;
  agentType: string;
  input: Prisma.InputJsonObject;
}

export const AGENT_RUN_STALE_AFTER_MS = 5 * 60 * 1000;

export function getStaleAgentRunCutoff(now = new Date()): Date {
  return new Date(now.getTime() - AGENT_RUN_STALE_AFTER_MS);
}

export async function closeStaleAgentRuns(tenantId: string, agentType?: string): Promise<void> {
  const finishedAt = new Date();
  await prisma.agentRun.updateMany({
    where: {
      tenantId,
      status: "running",
      startedAt: { lt: getStaleAgentRunCutoff(finishedAt) },
      ...(agentType ? { agentType } : {}),
    },
    data: {
      status: "error",
      errorMsg: "Agent run timed out before completion",
      finishedAt,
    },
  });
}

export type StartAgentRunResult =
  | { run: AgentRun; response: null }
  | { run: null; response: NextResponse };

export async function startAgentRun({
  tenantId,
  agentType,
  input,
}: StartAgentRunInput): Promise<StartAgentRunResult> {
  await closeStaleAgentRuns(tenantId, agentType);

  try {
    const run = await prisma.agentRun.create({
      data: {
        tenantId,
        agentType,
        status: "running",
        input,
      },
    });

    return { run, response: null };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        run: null,
        response: apiError("Agent run already in progress", 409, "AGENT_RUN_ALREADY_RUNNING"),
      };
    }

    throw error;
  }
}
