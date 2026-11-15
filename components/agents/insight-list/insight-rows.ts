import type { BadgeTone } from "@/components/ui/badge/badge";

export type InsightVariant = "card" | "dialog";

type InsightResult = {
  status?: string;
  insight?: string;
  recommendation?: string;
};

export type ChannelInsight = InsightResult & { channel?: string };
export type CategoryInsight = InsightResult & { category?: string; attribute?: string };

export type InsightRow = InsightResult & {
  title?: string;
  tone?: BadgeTone;
  color?: string;
};

type StatusStyle = { tone?: BadgeTone; color: string };

const neutral: StatusStyle = { color: "var(--muted)" };
const positive: StatusStyle = { tone: "positive", color: "var(--cyan-ink)" };
const warning: StatusStyle = { tone: "warning", color: "var(--amber-ink)" };

const channelStatuses: ReadonlyMap<string, StatusStyle> = new Map([
  ["best", positive],
  ["weak", warning],
  ["inactive", warning],
]);

const categoryStatuses: ReadonlyMap<string, StatusStyle> = new Map([
  ["bestseller", positive],
  ["slow", warning],
  ["dead", { tone: "danger", color: "var(--danger-ink)" }],
  ["stockout", { color: "var(--info-ink)" }],
]);

function makeInsightRow(
  { status, insight, recommendation }: InsightResult,
  title: string | undefined,
  appearance: StatusStyle,
  variant: InsightVariant,
): InsightRow {
  return {
    title,
    status,
    insight,
    recommendation,
    ...(variant === "dialog" ? { color: appearance.color } : { tone: appearance.tone }),
  };
}

export function buildChannelInsightRows(
  channels: readonly ChannelInsight[],
  variant: InsightVariant,
): InsightRow[] {
  return channels.map((row) => makeInsightRow(
    row,
    row.channel,
    channelStatuses.get(row.status ?? "") ?? neutral,
    variant,
  ));
}

export function buildCategoryInsightRows(
  categories: readonly CategoryInsight[],
  variant: InsightVariant,
): InsightRow[] {
  return categories.map((row) => {
    const status = variant === "card" ? row.status || "normal" : row.status;
    return makeInsightRow(
      { ...row, status },
      row.category || row.attribute,
      categoryStatuses.get(status ?? "") ?? neutral,
      variant,
    );
  });
}
