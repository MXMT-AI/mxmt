import { AgentRun, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-contracts";

interface StartAgentRunInput {
  tenantId: string;
  agentType: string;
  input: Prisma.InputJsonObject;
}

export type StartAgentRunResult =
  | { run: AgentRun; response: null }
  | { run: null; response: NextResponse };

export async function startAgentRun({
  tenantId,
  agentType,
  input,
}: StartAgentRunInput): Promise<StartAgentRunResult> {
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
