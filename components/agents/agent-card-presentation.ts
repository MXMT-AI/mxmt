import { formatMessage } from "@/i18n/format-message";
import { agentsAgentCardPresentationMessages as ukrainianCopy } from "@/messages/uk.json";

export function badgeStyle(color: string) {
  return {
    color,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
  };
}

export function campaignHealthLabel(status: string) {
  if (status === "on_track") return ukrainianCopy.наПравильномуШляху;
  if (status === "critical") return ukrainianCopy.критичнийСтан;
  if (status === "not_started") return ukrainianCopy.щеНеЗапущено;
  if (status === "insufficient_data") return ukrainianCopy.недостатньоДаних;
  return ukrainianCopy.потребуєУваги;
}

export function campaignHealthClasses(status: string) {
  if (status === "on_track") return "bg-accent-cyan/5 border-accent-cyan/20 text-accent-cyan";
  if (status === "critical") return "bg-accent-danger/5 border-accent-danger/20 text-accent-danger";
  if (status === "not_started") return "bg-(--input-bg) border-(--border) text-(--muted)";
  return "bg-accent-yellow/5 border-accent-yellow/20 text-accent-yellow";
}

export function campaignStatusColor(status: string) {
  if (status === "ahead") return "var(--cyan-ink)";
  if (status === "on_track") return "var(--positive-ink)";
  if (status === "behind") return "var(--amber-ink)";
  if (status === "insufficient_data" || status === "scheduled") return "var(--muted)";
  return "var(--danger-ink)";
}

export function campaignMetricLabel(campaign: any) {
  if (campaign.days_running == null || campaign.performance_score == null) return ukrainianCopy.метрикиВідсутні;
  return formatMessage(ukrainianCopy.д10, { days_running: campaign.days_running, performance_score: campaign.performance_score });
}
