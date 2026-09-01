import { prisma } from "@/lib/prisma";
import { getActiveAgentImportRunId } from "@/lib/agent-data-source";

export interface AttributeMetric {
  attribute: string; // category or subcategory value
  attributeType: "category" | "subcategory";
  skuCount: number;
  totalStock: number;
  salesLast7d: number;
  salesLast30d: number;
  strPercent: number;
  status: "bestseller" | "normal" | "slow" | "dead";
}

export interface AttributeMetrics {
  byCategory: AttributeMetric[];
  bySubcategory: AttributeMetric[];
  topCategories: string[];
  deadCategories: string[];
}

const STR_BESTSELLER = 25; // % per week
const STR_SLOW = 5;
const STR_DEAD = 1;

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

  const salesByProduct = new Map<string, { sold7: number; sold30: number }>();
  for (const sale of sales) {
    if (!sale.resolvedProductId || !sale.paymentDate) continue;
    const current = salesByProduct.get(sale.resolvedProductId) ?? { sold7: 0, sold30: 0 };
    const quantity = Number(sale.normalizedQuantity);
    current.sold30 += quantity;
    if (sale.paymentDate >= d7) current.sold7 += quantity;
    salesByProduct.set(sale.resolvedProductId, current);
  }

  // Group by category
  const catMap = new Map<string, { stock: number; sold7: number; sold30: number; skus: Set<string> }>();
  const subMap = new Map<string, { stock: number; sold7: number; sold30: number; skus: Set<string> }>();

  for (const product of products) {
    const stock = Number(product.stockUnits);
    const { sold7, sold30 } = salesByProduct.get(product.productId) ?? { sold7: 0, sold30: 0 };

    // Category
    const cat = product.category || "Other";
    const existing = catMap.get(cat) ?? { stock: 0, sold7: 0, sold30: 0, skus: new Set() };
    catMap.set(cat, {
      stock: existing.stock + stock,
      sold7: existing.sold7 + sold7,
      sold30: existing.sold30 + sold30,
      skus: existing.skus.add(product.productId),
    });
  }

  function toMetric(
    key: string,
    type: "category" | "subcategory",
    v: { stock: number; sold7: number; sold30: number; skus: Set<string> }
  ): AttributeMetric {
    const strPct = v.stock > 0 ? Math.round((v.sold7 / v.stock) * 100 * 10) / 10 : 0;
    const status =
      strPct >= STR_BESTSELLER
        ? "bestseller"
        : strPct >= STR_SLOW
          ? "normal"
          : strPct >= STR_DEAD
            ? "slow"
            : "dead";
    return {
      attribute: key,
      attributeType: type,
      skuCount: v.skus.size,
      totalStock: v.stock,
      salesLast7d: v.sold7,
      salesLast30d: v.sold30,
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
