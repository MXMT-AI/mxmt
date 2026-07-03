import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const brandId = formData.get("brandId") as string | null;
    const season = (formData.get("season") as string) || "SS25";

    if (!file || !brandId) {
      return NextResponse.json(
        { error: "file and brandId are required" },
        { status: 400 }
      );
    }

    // Verify brand belongs to tenant
    const brand = await prisma.brand.findFirst({ where: { id: brandId, tenantId } });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // Parse Excel / CSV
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

    if (rows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Create catalog upload record + items, and upsert Sku records for analytics
    const upload = await prisma.$transaction(async (tx) => {
      const parsedItems = rows.map((row) => ({
        skuCode: String(row["SKU"] ?? row["sku"] ?? row["Артикул"] ?? "").trim(),
        name: String(row["Name"] ?? row["name"] ?? row["Назва"] ?? row["Наименование"] ?? "").trim(),
        category: String(row["Category"] ?? row["category"] ?? row["Категорія"] ?? row["Категория"] ?? "Other").trim(),
        color: row["Color"] ? String(row["Color"]) : null,
        style: row["Style"] ? String(row["Style"]) : null,
        material: row["Material"] ? String(row["Material"]) : null,
        priceWholesale: parseFloat(String(row["Price"] ?? row["price"] ?? row["Ціна"] ?? 0)) || 0,
        priceRetail: row["Retail"] ? parseFloat(String(row["Retail"])) : null,
        minOrder: parseInt(String(row["MinOrder"] ?? row["minOrder"] ?? row["МінЗамовлення"] ?? 1)) || 1,
        stockAvail: parseInt(String(row["Stock"] ?? row["stock"] ?? row["Залишок"] ?? 0)) || 0,
        leadTimeDays: parseInt(String(row["LeadTime"] ?? row["leadTime"] ?? brand.leadTimeDays)) || brand.leadTimeDays,
        tags: row["Tags"]
          ? String(row["Tags"]).split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      })).filter((r) => r.skuCode !== "");

      const upload = await tx.catalogUpload.create({
        data: {
          tenantId,
          brandId,
          season,
          fileName: file.name,
          itemCount: parsedItems.length,
        },
      });

      await tx.catalogItem.createMany({
        data: parsedItems.map((r) => ({
          tenantId,
          catalogId: upload.id,
          brandId,
          sku: r.skuCode,
          name: r.name,
          category: r.category,
          color: r.color,
          style: r.style,
          material: r.material,
          priceWholesale: r.priceWholesale,
          priceRetail: r.priceRetail,
          minOrder: r.minOrder,
          stockAvail: r.stockAvail,
          leadTimeDays: r.leadTimeDays,
          tags: r.tags,
        })),
      });

      // Upsert Sku records so Analyst Agent and Dashboard see this catalog
      for (const r of parsedItems) {
        await tx.sku.upsert({
          where: { tenantId_sku: { tenantId, sku: r.skuCode } },
          create: {
            tenantId,
            brandId,
            sku: r.skuCode,
            name: r.name,
            category: r.category,
            priceRetail: r.priceRetail ?? r.priceWholesale,
            pricePurchase: r.priceWholesale,
            season,
            status: "ACTIVE",
            tags: r.tags,
          },
          update: {
            name: r.name,
            category: r.category,
            priceRetail: r.priceRetail ?? r.priceWholesale,
            pricePurchase: r.priceWholesale,
            brandId,
            status: "ACTIVE",
            tags: r.tags,
          },
        });
      }

      return { upload, count: parsedItems.length };
    });

    return NextResponse.json({ uploadId: upload.upload.id, itemCount: upload.count });
  } catch (err) {
    console.error("[catalog/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
