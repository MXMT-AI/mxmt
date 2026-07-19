import type { LucideIcon } from "lucide-react";

export type AgentStatus = "idle" | "running" | "done" | "error";
export type BrandStatus = "critical" | "warning" | "balanced" | "excellent";

export interface BrandResult {
  brand_id: string;
  brand_name: string;
  status: BrandStatus;
  analysis: string;
  confidence: number;
  metrics_evaluation: {
    woh_status: "red" | "yellow" | "green";
    str_status: string;
    trend_status: "falling" | "stable" | "rising";
    gm_status: string;
  };
  suggested_actions: string[];
  urgency: string;
  metrics?: {
    wohDays: number;
    strPercent: number;
    trend7dPct: number;
    gmPercent: number;
    totalStock: number;
    salesLast7d: number;
    salesLast30d: number;
    frozenCapital: number;
    skuCount: number;
  };
}

export interface AgentRunInfo {
  id: string;
  status: AgentStatus;
  startedAt: string;
  finishedAt?: string;
  output?: { brands?: BrandResult[]; message?: string; [key: string]: any };
  errorMsg?: string;
}

export interface AgentDefinition {
  id: string;
  label: string;
  model: string;
  block: number;
  blockLabel: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  runnable: boolean;
  dependsOn: string[];
}

export interface AgentBlock {
  id: number;
  label: string;
  color: string;
  desc: string;
}
