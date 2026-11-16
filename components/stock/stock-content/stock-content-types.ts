import type { StockWorkspaceModel } from "@/lib/merchandising-stock-workspace";

export type Block = StockWorkspaceModel["byCurrency"][number];
export type Group = Block["categories"]["rows"][number];
export type Href = (values: Record<string, string | null>) => string;
