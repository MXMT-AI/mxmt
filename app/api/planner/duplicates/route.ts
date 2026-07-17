import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const items = await prisma.catalogItem.findMany({
    where: { tenantId },
    include: { brand: { select: { name: true } } },
    orderBy: [{ category: "asc" }, { color: "asc" }],
  });

  // Group by category + color + style — same combination across brands = potential duplicate
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const key = [
      item.category.toLowerCase().trim(),
      (item.color ?? "").toLowerCase().trim(),
      (item.style ?? "").toLowerCase().trim(),
    ].join("|");

    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  // Only return groups that span more than one brand
  const duplicates = Object.values(groups).filter((group) => {
    const brandIds = new Set(group.map((i) => i.brandId));
    return brandIds.size > 1;
  });

  return NextResponse.json(duplicates);
}
