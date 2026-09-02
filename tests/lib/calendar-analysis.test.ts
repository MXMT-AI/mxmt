import { describe, expect, it } from "vitest";
import { buildCalendarAnalysis, calendarWindow } from "@/lib/calendar-analysis";

const marketerOutput = {
  brands: [
    {
      brand_id: "zavod",
      brand_name: "ZAVOD",
      decision_summary: "Розпродаж −30%",
      channels: {
        ads: { action_needed: true },
        smm: { action_needed: true },
        email: { action_needed: true },
      },
    },
    {
      brand_id: "khvyli",
      brand_name: "KHVYLI",
      decision_summary: "Планова уцінка −15%",
      channels: { smm: { action_needed: true } },
    },
  ],
};

describe("calendar planning analysis", () => {
  it("treats unscheduled briefs as drafts instead of critical gaps", () => {
    const result = buildCalendarAnalysis({
      now: new Date("2026-09-02T12:00:00.000Z"),
      events: [],
      marketerOutput,
    });

    expect(result.health_score).toMatchObject({
      coverage_percent: 0,
      scheduled_recommendations: 0,
      recommendation_count: 2,
      draft_recommendations: 2,
      critical_gaps: 0,
      high_gaps: 0,
    });
    expect(result.annotations).toHaveLength(2);
    expect(result.annotations.every((annotation) => annotation.type === "suggestion")).toBe(true);
    expect(result.annotations[0]).toMatchObject({ brand: "ZAVOD", priority: "medium" });
    expect(result.annotations[0].suggested_action).toContain("погодити");
    expect(result.annotations[0].suggested_action).toContain("бюджет");
  });

  it("counts a recommendation as scheduled only when its brand is named in an event", () => {
    const result = buildCalendarAnalysis({
      now: new Date("2026-09-02T12:00:00.000Z"),
      events: [
        { weekKey: "w36", rowKey: "smm1", type: "promo", label: "ZAVOD: розпродаж −30%" },
      ],
      marketerOutput,
    });

    expect(result.health_score).toMatchObject({
      coverage_percent: 50,
      scheduled_recommendations: 1,
      recommendation_count: 2,
    });
    expect(result.annotations.find((annotation) => annotation.brand === "ZAVOD")?.type).toBe("ok");
    expect(result.annotations.find((annotation) => annotation.brand === "KHVYLI")?.type).toBe("suggestion");
  });

  it("reports collisions between real calendar events as high-priority conflicts", () => {
    const result = buildCalendarAnalysis({
      now: new Date("2026-09-02T12:00:00.000Z"),
      events: [
        { weekKey: "w36", rowKey: "ads1", type: "promo", label: "ZAVOD ads" },
        { weekKey: "w36", rowKey: "ads1", type: "promo", label: "ZAVOD ads" },
      ],
      marketerOutput,
    });

    expect(result.health_score.high_issues).toBe(1);
    expect(result.health_score.critical_issues).toBe(0);
    expect(result.annotations[0]).toMatchObject({
      type: "conflict",
      channel: "ads",
      priority: "high",
    });
  });

  it("does not call different events in the same weekly row a conflict without day-level data", () => {
    const result = buildCalendarAnalysis({
      now: new Date("2026-09-02T12:00:00.000Z"),
      events: [
        { weekKey: "w36", rowKey: "ads1", type: "promo", label: "ZAVOD ads" },
        { weekKey: "w36", rowKey: "ads1", type: "promo", label: "KHVYLI ads" },
      ],
      marketerOutput,
    });

    expect(result.health_score.high_issues).toBe(0);
    expect(result.annotations.some((annotation) => annotation.type === "conflict")).toBe(false);
  });

  it("builds valid week keys across the new year", () => {
    expect(calendarWindow(new Date("2026-12-28T12:00:00.000Z"))).toEqual({
      label: "2026-W53",
      weekKeys: ["w53", "w1", "w2", "w3"],
    });
  });
});
