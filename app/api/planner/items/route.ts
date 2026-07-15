import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

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
