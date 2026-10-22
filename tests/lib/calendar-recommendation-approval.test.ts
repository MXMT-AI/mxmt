import { describe, expect, it } from "vitest";
import { buildRecommendationCalendarEvents } from "@/lib/calendar-recommendation-approval";

describe("calendar recommendation approval", () => {
  const recommendation = {
    recommendation_id: "recommendation-zavod",
    brand_id: "zavod",
    brand_name: "ZAVOD",
    decision_summary: "Розпродаж −30%",
    channels: ["smm", "email", "ads", "store", "marketplace"] as const,
    status: "draft" as const,
  };

  it("maps approved channels to calendar rows", () => {
    const events = buildRecommendationCalendarEvents({
      recommendation: { ...recommendation, channels: [...recommendation.channels] },
      weekKey: "w36",
      selectedChannels: ["smm", "email", "ads", "store", "marketplace"],
    });

    expect(events.map((event) => [event.channel, event.rowKey])).toEqual([
      ["smm", "smm1"],
      ["email", "comm"],
      ["ads", "ads1"],
      ["store", "promo"],
      ["marketplace", "focus"],
    ]);
    expect(events.every((event) => event.weekKey === "w36" && event.label.includes("ZAVOD"))).toBe(true);
  });

  it("ignores duplicate and unapproved channels", () => {
    const events = buildRecommendationCalendarEvents({
      recommendation: { ...recommendation, channels: ["smm"] },
      weekKey: "w36",
      selectedChannels: ["smm", "smm", "ads"],
    });

    expect(events).toHaveLength(1);
    expect(events[0].channel).toBe("smm");
  });
});
