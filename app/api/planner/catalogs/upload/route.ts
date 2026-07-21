import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_CATALOG_ROWS = 5_000;
const SKU_WRITE_CONCURRENCY = 10;

type CatalogRow = Record<string, unknown>;

interface ParsedCatalogItem {
  skuCode: string;
  name: string;
  category: string;
  color: string | null;
  style: string | null;
  material: string | null;
  priceWholesale: number;
  priceRetail: number | null;
  minOrder: number;
  stockAvail: number;
  leadTimeDays: number;
  tags: string[];
}

function cell(row: CatalogRow, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function numberCell(row: CatalogRow, fallback: number, ...keys: string[]): number {
  for (const key of keys) {
    const raw = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    const value = Number.parseFloat(String(raw ?? "").replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function intCell(row: CatalogRow, fallback: number, ...keys: string[]): number {
  const value = Math.round(numberCell(row, fallback, ...keys));
  return Number.isFinite(value) ? value : fallback;
}

async function syncSkus(
  tenantId: string,
  brandId: string,
  season: string,
  items: ParsedCatalogItem[]
): Promise<void> {
  for (let index = 0; index < items.length; index += SKU_WRITE_CONCURRENCY) {
    const batch = items.slice(index, index + SKU_WRITE_CONCURRENCY);
    await Promise.all(
      batch.map((item) =>
        prisma.sku.upsert({
          where: { tenantId_sku: { tenantId, sku: item.skuCode } },
          create: {
            tenantId,
            brandId,
            sku: item.skuCode,
            name: item.name,
            category: item.category,
            priceRetail: item.priceRetail ?? item.priceWholesale,
            pricePurchase: item.priceWholesale,
            season,
            status: "ACTIVE",
            tags: item.tags,
          },
          update: {
            name: item.name,
            category: item.category,
            priceRetail: item.priceRetail ?? item.priceWholesale,
            pricePurchase: item.priceWholesale,
            brandId,
            status: "ACTIVE",
            tags: item.tags,
          },
        })
      )
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const brandId = formData.get("brandId") as string | null;
    const season = (formData.get("season") as string) || "SS25";

    if (!file || !brandId) {
      return apiError("file and brandId are required", 400, "VALIDATION_ERROR");
    }

    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return apiError("File must be between 1 byte and 4 MB", 400, "VALIDATION_ERROR");
    }

    // Verify brand belongs to tenant
    const brand = await prisma.brand.findFirst({ where: { id: brandId, tenantId } });
    if (!brand) {
      return apiError("Brand not found", 404, "NOT_FOUND");
    }

    // Parse Excel / CSV
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return apiError("Workbook has no sheets", 400, "VALIDATION_ERROR");
    }

    const ws = wb.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<CatalogRow>(ws, { defval: "" });

    if (rows.length === 0) {
      return apiError("File is empty", 400, "VALIDATION_ERROR");
    }

    if (rows.length > MAX_CATALOG_ROWS) {
      return apiError(`Catalog cannot exceed ${MAX_CATALOG_ROWS} rows`, 400, "VALIDATION_ERROR");
    }

    const dedupedItems = new Map<string, ParsedCatalogItem>();
    let skippedRows = 0;

    for (const row of rows) {
      const skuCode = cell(row, "SKU", "sku", "Артикул");
      const name = cell(row, "Name", "name", "Назва", "Наименование");

      if (!skuCode || !name) {
        skippedRows++;
        continue;
      }

      const priceWholesale = Math.max(0, numberCell(row, 0, "Price", "price", "Ціна"));
      const retailValue = numberCell(row, Number.NaN, "Retail", "retail", "RRP", "rrp");

      dedupedItems.set(skuCode, {
        skuCode,
        name,
        category: cell(row, "Category", "category", "Категорія", "Категория") || "Other",
        color: cell(row, "Color", "color") || null,
        style: cell(row, "Style", "style") || null,
        material: cell(row, "Material", "material") || null,
        priceWholesale,
        priceRetail: Number.isFinite(retailValue) ? Math.max(0, retailValue) : null,
        minOrder: Math.max(1, intCell(row, 1, "MinOrder", "minOrder", "МінЗамовлення")),
        stockAvail: Math.max(0, intCell(row, 0, "Stock", "stock", "Залишок")),
        leadTimeDays: Math.max(1, intCell(row, brand.leadTimeDays, "LeadTime", "leadTime")),
        tags: cell(row, "Tags", "tags")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
    }

    const parsedItems = [...dedupedItems.values()];
    if (parsedItems.length === 0) {
      return apiError("No valid catalog rows found", 400, "VALIDATION_ERROR");
    }

    // Create catalog upload record + items, and upsert Sku records for analytics
    const upload = await prisma.$transaction(async (tx) => {
      const upload = await tx.catalogUpload.upsert({
        where: { tenantId_brandId_season: { tenantId, brandId, season } },
        create: {
          tenantId,
          brandId,
          season,
          fileName: file.name,
          itemCount: parsedItems.length,
        },
        update: {
          fileName: file.name,
          itemCount: parsedItems.length,
        },
      });

      await tx.catalogItem.deleteMany({ where: { catalogId: upload.id } });
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

      return { upload, count: parsedItems.length };
    });

    await syncSkus(tenantId, brandId, season, parsedItems);

    return NextResponse.json({ uploadId: upload.upload.id, itemCount: upload.count, skippedRows });
  } catch (err) {
    console.error("[catalog/upload]", err);
    return serverError("Upload failed");
  }
}
