import { prisma } from "@/lib/prisma";
import { getActiveAgentImportRunId } from "@/lib/agent-data-source";

export interface AttributeMetric {
  attribute: string; // category or subcategory value
  attributeType: "category" | "subcategory";
  skuCount: number;
  totalStock: number;
  grossSalesLast7d: number;
  returnsLast7d: number;
  grossSalesLast30d: number;
  returnsLast30d: number;
  salesLast7d: number;
  salesLast30d: number;
  strPercent: number;
  status: "bestseller" | "normal" | "slow" | "dead" | "stockout" | "inactive";
}

export interface AttributeMetrics {
  byCategory: AttributeMetric[];
  bySubcategory: AttributeMetric[];
  topCategories: string[];
  deadCategories: string[];
}

const STR_BESTSELLER = 25; // % per week
const STR_SLOW = 5;

const CATEGORY_ALIASES = new Map<string, string>([
  ["other", "Other"],
  ["книги", "Книги"],
  ["книжки", "Книги"],
]);

function normalizeCategory(value: string | null): string {
  const normalized = (value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Other";
  return CATEGORY_ALIASES.get(normalized.toLocaleLowerCase("uk-UA")) ?? normalized;
}

export async function getAttributeMetrics(
  tenantId: string,
  asOf?: Date,
  from?: Date
): Promise<AttributeMetrics> {
  const now = asOf ?? new Date();
  const d30 = from ?? new Date(now.getTime() - 30 * 86400000);
  const d7 = new Date(Math.max(now.getTime() - 7 * 86400000, d30.getTime()));
  const importRunId = await getActiveAgentImportRunId(tenantId);
  if (!importRunId) {
    return { byCategory: [], bySubcategory: [], topCategories: [], deadCategories: [] };
  }

  const [products, sales] = await Promise.all([
    prisma.sourceProduct.findMany({
      where: { tenantId, importRunId },
      select: {
        productId: true,
        category: true,
        stockUnits: true,
      },
    }),
    prisma.sourceSaleLine.findMany({
      where: {
        tenantId,
        importRunId,
        paymentDate: { gte: d30, ...(asOf ? { lte: asOf } : {}) },
        resolvedProductId: { not: null },
        normalizedQuantity: { not: null },
      },
      select: { resolvedProductId: true, paymentDate: true, normalizedQuantity: true },
    }),
  ]);

  const salesByProduct = new Map<string, {
    grossSold7: number;
    returned7: number;
    grossSold30: number;
    returned30: number;
    netSold7: number;
    netSold30: number;
  }>();
  for (const sale of sales) {
    if (!sale.resolvedProductId || !sale.paymentDate) continue;
    const current = salesByProduct.get(sale.resolvedProductId) ?? {
      grossSold7: 0,
      returned7: 0,
      grossSold30: 0,
      returned30: 0,
      netSold7: 0,
      netSold30: 0,
    };
    const quantity = Number(sale.normalizedQuantity);
    current.netSold30 += quantity;
    if (quantity < 0) current.returned30 += Math.abs(quantity);
    else current.grossSold30 += quantity;

    if (sale.paymentDate >= d7) {
      current.netSold7 += quantity;
      if (quantity < 0) current.returned7 += Math.abs(quantity);
      else current.grossSold7 += quantity;
    }
    salesByProduct.set(sale.resolvedProductId, current);
  }

  // Group by category
  type Aggregate = {
    stock: number;
    grossSold7: number;
    returned7: number;
    grossSold30: number;
    returned30: number;
    netSold7: number;
    netSold30: number;
    skus: Set<string>;
  };
  const emptyAggregate = (): Aggregate => ({
    stock: 0,
    grossSold7: 0,
    returned7: 0,
    grossSold30: 0,
    returned30: 0,
    netSold7: 0,
    netSold30: 0,
    skus: new Set<string>(),
  });
  const catMap = new Map<string, Aggregate>();
  const subMap = new Map<string, Aggregate>();

  for (const product of products) {
    const stock = Number(product.stockUnits);
    const productSales = salesByProduct.get(product.productId) ?? emptyAggregate();

    // Category
    const cat = normalizeCategory(product.category);
    const existing = catMap.get(cat) ?? emptyAggregate();
    catMap.set(cat, {
      stock: existing.stock + stock,
      grossSold7: existing.grossSold7 + productSales.grossSold7,
      returned7: existing.returned7 + productSales.returned7,
      grossSold30: existing.grossSold30 + productSales.grossSold30,
      returned30: existing.returned30 + productSales.returned30,
      netSold7: existing.netSold7 + productSales.netSold7,
      netSold30: existing.netSold30 + productSales.netSold30,
      skus: existing.skus.add(product.productId),
    });
  }

  function toMetric(
    key: string,
    type: "category" | "subcategory",
    v: Aggregate
  ): AttributeMetric {
    const strPct = v.stock > 0 ? Math.round((v.grossSold7 / v.stock) * 100 * 10) / 10 : 0;
    const status =
      v.stock <= 0
        ? v.grossSold30 > 0 ? "stockout" : "inactive"
        : v.grossSold30 <= 0
          ? "dead"
        : strPct >= STR_BESTSELLER
          ? "bestseller"
          : strPct >= STR_SLOW
            ? "normal"
            : "slow";
    return {
      attribute: key,
      attributeType: type,
      skuCount: v.skus.size,
      totalStock: v.stock,
      grossSalesLast7d: v.grossSold7,
      returnsLast7d: v.returned7,
      grossSalesLast30d: v.grossSold30,
      returnsLast30d: v.returned30,
      salesLast7d: v.netSold7,
      salesLast30d: v.netSold30,
      strPercent: strPct,
      status,
    };
  }

  const byCategory = [...catMap.entries()]
    .map(([k, v]) => toMetric(k, "category", v))
    .sort((a, b) => b.salesLast30d - a.salesLast30d);

  const bySubcategory = [...subMap.entries()]
    .map(([k, v]) => toMetric(k, "subcategory", v))
    .sort((a, b) => b.salesLast30d - a.salesLast30d);

  const topCategories = byCategory.filter((c) => c.status === "bestseller").map((c) => c.attribute);
  const deadCategories = byCategory.filter((c) => c.status === "dead").map((c) => c.attribute);

  return { byCategory, bySubcategory, topCategories, deadCategories };
}
