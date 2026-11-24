import { isRecord } from "./api-contracts";
import { formatMessage } from "@/i18n/format-message";
import { weeklyCampaignStatusMessages as copy } from "@/messages/uk.json";

export function readWeeklyCampaignStatus(output: unknown) {
  if (!isRecord(output)) return null;
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const active = count(output.active_campaign_count);
  const scheduled = count(output.scheduled_campaign_count);
  const pending = count(output.pending_recommendations);
  if (active === null || scheduled === null || pending === null) return null;
  return { active, scheduled, pending };
}

type CampaignStatus = NonNullable<ReturnType<typeof readWeeklyCampaignStatus>>;

export function groundWeeklyCampaignBrief(output: unknown, status: CampaignStatus | null) {
  if (!status || !isRecord(output)) return output;
  const campaign_status = {
    active_campaign_count: status.active,
    scheduled_campaign_count: status.scheduled,
    pending_recommendations: status.pending,
  };
  return {
    ...output,
    campaign_status,
    ...(status.active === 0
      ? { marketing_brief: formatMessage(copy.noActiveCampaigns, status) }
      : {}),
  };
}
