import { describe, expect, it } from "vitest";
import {
  buildAgentRunContext,
  isAgentRunCurrent,
  selectCurrentDependencyRun,
} from "@/lib/agent-context";

const context = buildAgentRunContext({
  importRunId: "import-new",
  asOf: "2026-08-31T12:00:00.000Z",
  dateFrom: "2026-08-01",
}, new Date("2026-09-01T10:00:00.000Z"));

describe("agent run context", () => {
  it("canonicalizes import and period into stable date keys", () => {
    expect(context).toEqual({
      importRunId: "import-new",
      asOf: "2026-08-31",
      dateFrom: "2026-08-01",
    });
  });

  it("uses the Kyiv calendar date when asOf is omitted", () => {
    expect(buildAgentRunContext(
      { importRunId: "import-new" },
      new Date("2026-08-31T22:30:00.000Z")
    ).asOf).toBe("2026-09-01");
  });

  it("marks a run from another import or period as stale", () => {
    expect(isAgentRunCurrent({ input: context }, context)).toBe(true);
    expect(isAgentRunCurrent({ input: { ...context, importRunId: "import-old" } }, context)).toBe(false);
    expect(isAgentRunCurrent({ input: { ...context, asOf: "2026-08-30" } }, context)).toBe(false);
  });

  it("does not fall back to an older success after the latest current attempt failed", () => {
    const runs = [
      { id: "latest", status: "error", input: context },
      { id: "older", status: "done", input: context },
      { id: "stale", status: "done", input: { ...context, importRunId: "import-old" } },
    ];

    expect(selectCurrentDependencyRun(runs, context)).toEqual({
      run: runs[0],
      ready: false,
      reason: "error",
    });
  });
});
