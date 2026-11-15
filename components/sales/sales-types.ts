import type { SalesWorkspaceModel } from "@/lib/merchandising-sales-workspace";

export type SalesCurrencyBlock = SalesWorkspaceModel["byCurrency"][number];
export type SalesMatrixRow = SalesCurrencyBlock["matrix"]["rows"][number];
export type SalesHref = (values: Record<string, string | null>) => string;
