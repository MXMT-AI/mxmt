import { expect, it } from "vitest";
import { groundWeeklyCampaignBrief, readWeeklyCampaignStatus } from "@/lib/weekly-campaign-status";

it("keeps pending briefs separate from scheduled and active campaigns in a saved report", () => {
  const facts = {
    active_campaign_count: 0,
    scheduled_campaign_count: 0,
    pending_recommendations: 8,
    campaigns: [],
  };
  const report = { marketing_brief: "Використовуйте активні промокампанії.", top_priorities: [] };
  expect(groundWeeklyCampaignBrief(report, readWeeklyCampaignStatus(facts))).toMatchObject({
    marketing_brief: expect.stringContaining("Очікують погодження: 8"),
    campaign_status: {
      active_campaign_count: 0,
      scheduled_campaign_count: 0,
      pending_recommendations: 8,
    },
    top_priorities: [],
  });
  expect(report.marketing_brief).toBe("Використовуйте активні промокампанії.");
  expect(readWeeklyCampaignStatus({ campaigns: [{}] })).toBeNull();
});
