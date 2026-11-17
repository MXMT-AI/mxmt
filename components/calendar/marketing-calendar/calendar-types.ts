export interface Chip { t: string; l: string; id?: string }
export type CalendarTab = "plan" | "agent" | "stock";
export type ChipType = "promo" | "holiday" | "agent" | "warn" | "sale" | "event" | "stock";

export interface Week { k: string; l: string; d: string; m: string }
export interface CalendarSchedule { weeks: Week[]; holidayChips: Record<string, Chip[]> }

export type Row = { t: "g"; l: string } | { t: "r"; l: string; k: string };

export interface StockItem {
  brand: string;
  stock: number;
  woh: number | null;
  status: "ok" | "warn" | "crit" | "excess";
}

export interface DbEvent {
  id: string;
  weekKey: string;
  rowKey: string;
  type: string;
  label: string;
}

export interface InsightItem {
  type: "warn" | "agent" | "stock";
  brand: string;
  week: string;
  title: string;
  desc: string;
  impact: string;
  weekKey?: string;
  rowKey?: string;
}

export interface AiPlanChip { weekKey: string; rowKey: string; type: ChipType; label: string }
export type EventLocation = { rowKey: string; weekKey: string };
export type EventDialogState =
  | ({ mode: "add" } & EventLocation)
  | ({ mode: "edit"; id: string; type: string; label: string } & EventLocation);

export type EventDraft = EventLocation & { type: string; label: string };
