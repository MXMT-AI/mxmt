import type { AiPlanChip, Chip, DbEvent, InsightItem } from "./calendar-types";

function indexChips<T extends { rowKey?: string; weekKey?: string }>(items: T[], toChip: (item: T) => Chip) {
  const rows = new Map<string, Map<string, Chip[]>>();
  for (const item of items) {
    if (item.rowKey === undefined || item.weekKey === undefined) continue;
    let weeks = rows.get(item.rowKey);
    if (!weeks) rows.set(item.rowKey, weeks = new Map());
    let chips = weeks.get(item.weekKey);
    if (!chips) weeks.set(item.weekKey, chips = []);
    chips.push(toChip(item));
  }
  return (rowKey: string, weekKey: string) => rows.get(rowKey)?.get(weekKey);
}

export function createCalendarChipLookup({ dbEvents, aiChips, insights, holidayChips, demoEvents, demoAgentInsights, showDemo, agentMode }: {
  dbEvents: DbEvent[];
  aiChips: AiPlanChip[];
  insights: InsightItem[];
  holidayChips: Record<string, Chip[]>;
  demoEvents: Record<string, Record<string, Chip[]>>;
  demoAgentInsights: Record<string, Chip[]>;
  showDemo: boolean;
  agentMode: boolean;
}) {
  const users = indexChips(dbEvents, event => ({ t: event.type, l: event.label, id: event.id }));
  const plans = indexChips(agentMode ? aiChips : [], chip => ({ t: chip.type, l: chip.label }));
  const tips = indexChips(agentMode ? insights : [], insight => ({
    t: insight.type,
    l: insight.brand.length > 18 ? insight.brand.slice(0, 16) + "…" : insight.brand,
  }));

  return (rowKey: string, weekKey: string): Chip[] => {
    const holidays = rowKey === "events" ? (holidayChips[weekKey] ?? []) : [];
    const demo = showDemo ? (demoEvents[rowKey]?.[weekKey] ?? []) : [];
    const user = users(rowKey, weekKey) ?? [];
    const agent = agentMode
      ? plans(rowKey, weekKey) ?? tips(rowKey, weekKey) ?? (showDemo ? demoAgentInsights[`${weekKey}_${rowKey}`] : undefined) ?? []
      : [];
    return [...holidays, ...demo, ...user, ...agent];
  };
}
