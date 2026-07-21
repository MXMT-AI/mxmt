import { describe, expect, it } from "vitest";
import { AGENT_RUN_STALE_AFTER_MS, getStaleAgentRunCutoff } from "@/lib/agent-runs";

describe("agent run timeout", () => {
  it("marks runs stale after five minutes", () => {
    const now = new Date("2026-07-21T13:30:00.000Z");

    expect(AGENT_RUN_STALE_AFTER_MS).toBe(300_000);
    expect(getStaleAgentRunCutoff(now).toISOString()).toBe("2026-07-21T13:25:00.000Z");
  });
});
