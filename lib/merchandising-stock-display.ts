import type { StockCopy } from "./stock-copy";

export const stockStatusColors: Record<string, string> = {
  HEALTHY: "var(--chart-healthy, #599577)",
  RISK: "var(--chart-risk, #d19a35)",
  DEAD: "var(--chart-dead, #a74b44)",
  NEW: "#8a939d",
  OFF_SEASON: "#8a939d",
  OOS: "#94a3b8",
  DATA_ERROR: "#b17946",
  SERVICE: "#718096",
};

export const primaryStockStatuses = ["DEAD", "RISK", "HEALTHY"] as const;

export function stockStatusLabel(copy: StockCopy, status: string) {
  return copy.statuses[status as keyof StockCopy["statuses"]] ?? status;
}
