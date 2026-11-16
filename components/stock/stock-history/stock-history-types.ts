import type { StockHistory } from "@/lib/stock-history";

export type HistoryPoints = StockHistory["byCurrency"][number]["points"];
