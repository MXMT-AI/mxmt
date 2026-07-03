import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  // Get latest inventory snapshot per SKU
  const snapshots = await prisma.inventorySnapshot.findMany({
    where: { tenantId },
    orderBy: { snapshotDate: "desc" },
    distinct: ["skuId"],
    include: { sku: { include: { brand: { select: { id: true, name: true } } } } },
  });

  // Get sales last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const sales = await prisma.salesRecord.findMany({
    where: { tenantId, date: { gte: since } },
    include: { sku: { include: { brand: { select: { id: true, name: true } } } } },
  });

  // Aggregate by brand
  const brandStock: Record<string, { name: string; stock: number; sales30: number }> = {};

  for (const snap of snapshots) {
    const brandId = snap.sku.brand?.id;
    const brandName = snap.sku.brand?.name;
    if (!brandId || !brandName) continue;
    if (!brandStock[brandId]) brandStock[brandId] = { name: brandName, stock: 0, sales30: 0 };
    brandStock[brandId].stock += snap.qtyOnHand;
  }

  for (const sale of sales) {
    const brandId = sale.sku.brand?.id;
    if (!brandId || !brandStock[brandId]) continue;
    brandStock[brandId].sales30 += sale.qtySold;
  }

  const result = Object.values(brandStock).map((b) => {
    const avgWeeklySales = b.sales30 / 4.3;
    const woh = avgWeeklySales > 0 ? Math.round(b.stock / avgWeeklySales) : null;
    const status =
      woh === null ? "ok"
      : woh < 8  ? "crit"
      : woh < 14 ? "warn"
      : woh > 60 ? "excess"
      : "ok";
    return { brand: b.name, stock: b.stock, woh, status };
  });

  return NextResponse.json(result);
}
