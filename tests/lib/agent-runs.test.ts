import { describe, expect, it, vi } from "vitest";
import {
  AGENT_RUN_STALE_AFTER_MS,
  completeAgentRun,
  failAgentRun,
  getStaleAgentRunCutoff,
} from "@/lib/agent-runs";
import { buildAgentRunContext, selectAgentDisplayRun } from "@/lib/agent-context";

vi.mock("server-only", () => ({}));
const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { agentRun: { update } } }));

describe("agent run timeout", () => {
  it("marks runs stale after five minutes", () => {
    const now = new Date("2026-07-21T13:30:00.000Z");

    expect(AGENT_RUN_STALE_AFTER_MS).toBe(300_000);
    expect(getStaleAgentRunCutoff(now).toISOString()).toBe("2026-07-21T13:25:00.000Z");
  });
});

it("keeps the saved result in view after a separate run fails", async () => {
  const context = buildAgentRunContext({ asOf: "2026-11-19", importRunId: "import" });
  const runs = [
    { id: "retry", status: "running", input: context },
    { id: "previous", status: "running", input: context },
  ];
  update.mockImplementation(async ({ where, data }) => {
    Object.assign(runs.find((run) => run.id === where.id)!, data);
  });
  const output = { recommendations: ["saved"] };

  await completeAgentRun("previous", output);
  await failAgentRun("retry", "temporary error");

  const selected = selectAgentDisplayRun(runs, context);
  expect(selected.run).toMatchObject({ id: "previous", status: "done", output });
  expect(selected.attempt).toMatchObject({ id: "retry", status: "error" });
});
