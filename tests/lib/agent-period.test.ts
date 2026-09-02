import { describe, expect, it } from "vitest";
import { parseStoredAgentPeriod } from "@/lib/agent-period";

describe("stored agent period", () => {
  const today = "2026-09-02";

  it("restores a valid custom period", () => {
    expect(
      parseStoredAgentPeriod(
        JSON.stringify({ analysisDate: "2026-08-31", dateFrom: "2026-08-01" }),
        today
      )
    ).toEqual({ analysisDate: "2026-08-31", dateFrom: "2026-08-01" });
  });

  it("restores the standard window selection", () => {
    expect(
      parseStoredAgentPeriod(
        JSON.stringify({ analysisDate: "2026-09-02", dateFrom: "" }),
        today
      )
    ).toEqual({ analysisDate: "2026-09-02", dateFrom: "" });
  });

  it.each([
    "not-json",
    JSON.stringify({ analysisDate: "2026-09-03", dateFrom: "2026-08-01" }),
    JSON.stringify({ analysisDate: "2026-08-31", dateFrom: "2026-08-31" }),
    JSON.stringify({ analysisDate: "2026-02-30", dateFrom: "" }),
  ])("rejects an invalid saved period", (raw) => {
    expect(parseStoredAgentPeriod(raw, today)).toBeNull();
  });
});
