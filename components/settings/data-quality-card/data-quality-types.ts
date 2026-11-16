import type { QualityStockGroup } from "../data-quality-summary/data-quality-summary";

export interface QualityProduct {
  id: string;
  sku: string;
  name: string;
  productKind: string;
  brandKey: string;
  issues: string[];
  ageReference: { date: string | null; basis: string };
  sourceId: string;
  observedAt: string | null;
  importRunId: string;
  sourceRecordKey: string;
}
export interface Quality extends Record<string, unknown> {
  rows: QualityProduct[];
  pagination: { page: number; pageSize: number; totalRows: number };
  summary: (QualityStockGroup & { code: string })[];
  affectedStock: QualityStockGroup[];
  brands: Array<{ id: string; name: string }>;
  aliases: Array<{
    value: string;
    brandId: string;
    name: string;
    revision: number;
  }>;
  components: Array<{
    component: string;
    currency: string | null;
    lineCount: number;
    revenue: string | null;
    missingAmountCount: number;
  }>;
  stock?: Array<{
    brandKey: string;
    currency: string | null;
    quantity: string | null;
    costValue: string | null;
  }>;
  orderExceptions?: Array<{
    code: string;
    sourceSku: string | null;
    orderId: string;
    lineId: string;
  }>;
  normalizationReplayRequired: number;
}
