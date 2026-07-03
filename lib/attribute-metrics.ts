import { prisma } from "@/lib/prisma";

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

  const skus = await prisma.sku.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "NEW"] } },
    select: {
      id: true,
      category: true,
      subcategory: true,
      inventorySnapshots: {
        ...(asOf ? { where: { snapshotDate: { lte: asOf } } } : {}),
        orderBy: { snapshotDate: "desc" },
        take: 1,
        select: { qtyOnHand: true },
      },
      salesRecords: {
        where: { tenantId, date: asOf ? { gte: d30, lte: asOf } : { gte: d30 } },
        select: { qtySold: true, date: true },
      },
    },
  });

  // Group by category
  const catMap = new Map<string, { stock: number; sold7: number; sold30: number; skus: Set<string> }>();
  const subMap = new Map<string, { stock: number; sold7: number; sold30: number; skus: Set<string> }>();

  for (const sku of skus) {
    const stock = sku.inventorySnapshots[0]?.qtyOnHand ?? 0;
    let sold7 = 0;
    let sold30 = 0;
    for (const sale of sku.salesRecords) {
      sold30 += sale.qtySold;
      if (new Date(sale.date) >= d7) sold7 += sale.qtySold;
    }

    // Category
    const cat = sku.category || "Other";
    const existing = catMap.get(cat) ?? { stock: 0, sold7: 0, sold30: 0, skus: new Set() };
    catMap.set(cat, {
      stock: existing.stock + stock,
      sold7: existing.sold7 + sold7,
      sold30: existing.sold30 + sold30,
      skus: existing.skus.add(sku.id),
    });

    // Subcategory
    if (sku.subcategory) {
      const sub = sku.subcategory;
      const exSub = subMap.get(sub) ?? { stock: 0, sold7: 0, sold30: 0, skus: new Set() };
      subMap.set(sub, {
        stock: exSub.stock + stock,
        sold7: exSub.sold7 + sold7,
        sold30: exSub.sold30 + sold30,
        skus: exSub.skus.add(sku.id),
      });
    }
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
