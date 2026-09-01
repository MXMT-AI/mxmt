import { describe, expect, it } from "vitest";
import { areAgentDependenciesReady, formatWohDays } from "@/components/agents/agents.utils";
import type { AgentDefinition, AgentRunInfo } from "@/components/agents/agents.types";

describe("agent UI state", () => {
  it("blocks an agent when a dependency is stale even if it previously succeeded", () => {
    const agent = { dependsOn: ["repricing", "reordering"] } as AgentDefinition;
    const runs: Record<string, AgentRunInfo> = {
      repricing: { id: "1", status: "done", startedAt: "2026-09-01", isCurrent: false },
      reordering: { id: "2", status: "done", startedAt: "2026-09-01", isCurrent: true },
    };

    expect(areAgentDependenciesReady(agent, runs)).toBe(false);
    runs.repricing.isCurrent = true;
    expect(areAgentDependenciesReady(agent, runs)).toBe(true);
  });

  it("shows no-sales WOH as text instead of 9999 days", () => {
    expect(formatWohDays(9999)).toBe("Немає продажів");
    expect(formatWohDays(45)).toBe("45д");
  });
});
