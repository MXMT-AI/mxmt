import { describe, expect, it } from "vitest";
import { buildCampaignTrackingOutput } from "@/lib/campaign-tracking";

describe("campaign tracking guardrails", () => {
  it("does not turn calendar suggestions into active campaigns", () => {
    const result = buildCampaignTrackingOutput({
      now: new Date("2026-09-02T12:00:00.000Z"),
      calendarOutput: {
        annotations: [
          { type: "suggestion", brand: "ZAVOD" },
          { type: "suggestion", brand: "KHVYLI" },
        ],
        health_score: {
          recommendation_count: 2,
          draft_recommendations: 2,
          scheduled_recommendations: 0,
        },
        scheduled_campaigns: [],
      },
    });

    expect(result).toMatchObject({
      campaigns: [],
      overall_health: "not_started",
      active_campaign_count: 0,
      scheduled_campaign_count: 0,
      pending_recommendations: 2,
      recommendation_count: 2,
    });
    expect(result.summary).toContain("Активних кампаній немає");
  });

  it("tracks a calendar-backed recommendation without inventing performance", () => {
    const result = buildCampaignTrackingOutput({
      now: new Date("2026-09-02T12:00:00.000Z"),
      calendarOutput: {
        health_score: {
          recommendation_count: 2,
          draft_recommendations: 1,
        },
        scheduled_campaigns: [
          {
            brand_id: "zavod",
            brand_name: "ZAVOD",
            decision_summary: "Розпродаж −30%",
            events: [
              { weekKey: "w36", rowKey: "smm1", type: "promo", label: "ZAVOD: розпродаж −30%" },
            ],
          },
        ],
      },
    });

    expect(result).toMatchObject({
      overall_health: "insufficient_data",
      active_campaign_count: 0,
      scheduled_campaign_count: 1,
      pending_recommendations: 1,
    });
    expect(result.campaigns[0]).toMatchObject({
      brand_id: "zavod",
      brand_name: "ZAVOD",
      status: "insufficient_data",
      days_running: null,
      performance_score: null,
    });
    expect(result.campaigns[0].actual_observation).toContain("Немає підтвердженої дати");
  });
});
