import type { PromoSimParams } from "@/components/agents/PromoTableModal";
import type { ReorderSimParams } from "@/components/agents/ReorderTableModal";
import type { AgentDefinition, AgentRunInfo, BrandStatus } from "@/components/agents/agents.types";

export function areAgentDependenciesReady(
  agent: Pick<AgentDefinition, "dependsOn">,
  runs: Record<string, AgentRunInfo>
): boolean {
  return agent.dependsOn.every((dependency) => {
    const run = runs[dependency];
    return run?.status === "done" && run.isCurrent === true;
  });
}

export function formatWohDays(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 9999) return "Немає продажів";
  return `${value}д`;
}

export function buildSimParams(brand: any, opt: any, debug?: Record<string, any>): PromoSimParams {
  return {
    brandId: brand.brand_id,
    brandName: brand.brand_name,
    strategyType: opt.strategy_type ?? "",
    label: opt.label ?? "",
    discountPercent: Number(opt.discount_percent ?? 0),
    durationDays: Number(opt.duration_days ?? 14),
    unitsToSellPercent: opt.forecast?.units_to_sell_percent ?? null,
    asOf: debug?.asOf ?? null,
    dateFrom: debug?.dateFrom ?? null,
  };
}

export function buildReorderParams(brand: any, sc: any, debug?: Record<string, any>): ReorderSimParams {
  return {
    brandId: brand.brand_id,
    brandName: brand.brand_name,
    type: sc.type ?? "",
    label: sc.label ?? "",
    qtyMultiplier: Number(sc.qty_multiplier ?? 1),
    asOf: debug?.asOf ?? null,
    dateFrom: debug?.dateFrom ?? null,
  };
}

export function statusColor(status: BrandStatus) {
  if (status === "critical") return "#ef4444";
  if (status === "warning") return "#fbbf24";
  if (status === "excellent") return "#00e5c4";
  return "#6b7a8d";
}

export function statusLabel(status: BrandStatus) {
  if (status === "critical") return "КРИТИЧНО";
  if (status === "warning") return "ПОПЕРЕДЖЕННЯ";
  if (status === "excellent") return "ВІДМІННО";
  return "НОРМА";
}

export function fmt(dt?: string) {
  if (!dt) return "—";
  const date = new Date(dt);
  return date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDate(dt?: string) {
  if (!dt) return null;
  const date = new Date(dt);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return fmt(dt);
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short" }) + " " + fmt(dt);
}

export function duration(run?: AgentRunInfo) {
  if (!run?.startedAt || !run?.finishedAt) return null;
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
