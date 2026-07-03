import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get("brandId");
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const catalogId = searchParams.get("catalogId");

  const items = await prisma.catalogItem.findMany({
    where: {
      tenantId,
      ...(brandId && brandId !== "all" ? { brandId } : {}),
      ...(category && category !== "all" ? { category } : {}),
      ...(catalogId ? { catalogId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { brand: { select: { id: true, name: true, currency: true } } },
    orderBy: [{ brandId: "asc" }, { category: "asc" }, { name: "asc" }],
    take: 500, // safety limit
  });

  return NextResponse.json(items);
}
