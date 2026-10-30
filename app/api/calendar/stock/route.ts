import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const snapshots = await prisma.inventorySnapshot.findMany({
    where: { tenantId, sourceId: null,sku:{productKind:{notIn:["SERVICE","GIFT_CARD"]}} },
    orderBy: { snapshotDate: "desc" },
    distinct: ["skuId"],
    include: { sku: { include: { brand: { select: { id: true, name: true } } } } },
  });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const sales = await prisma.salesRecord.findMany({
    where: { tenantId,sku:{productKind:{notIn:["SERVICE","GIFT_CARD"]}}, date: { gte: since } },
    include: { sku: { include: { brand: { select: { id: true, name: true } } } } },
  });

  const brandStock: Record<string, { name: string; stock: number; sales30: number }> = {};

  for (const snap of snapshots) {
    const brandId = snap.sku.brand?.id ?? "__unbranded__";
    const brandName = snap.sku.brand?.name ?? "Unbranded";
    const quantity = snap.quantity == null ? snap.qtyOnHand : Number(snap.quantity);
    if (quantity === null) continue;
    if (!brandStock[brandId]) brandStock[brandId] = { name: brandName, stock: 0, sales30: 0 };
    brandStock[brandId].stock += quantity;
  }

  for (const sale of sales) {
    const brandId = sale.sku.brand?.id ?? "__unbranded__";
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
