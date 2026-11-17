import { requireWorkspaceTenantId } from "@/lib/workspace-request";
import PlannerApp from "@/components/planner/planner-app";
import type { CartItem } from "@/components/planner/planner-types";
import { isRecord } from "@/lib/api-contracts";
import { prisma } from "@/lib/prisma";

function parseCartItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];

  return items.filter((value: unknown): value is CartItem => (
    isRecord(value) &&
    typeof value.catalogItemId === "string" &&
    typeof value.sku === "string" &&
    typeof value.name === "string" &&
    typeof value.brandId === "string" &&
    typeof value.brandName === "string" &&
    typeof value.category === "string" &&
    typeof value.price === "number" &&
    typeof value.currency === "string" &&
    typeof value.qty === "number" &&
    typeof value.minOrder === "number"
  ));
}

export default async function AssortmentPage() {
  const tenantId = await requireWorkspaceTenantId();

  const [brands, catalogs, cart] = await Promise.all([
    prisma.brand.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        budget: true,
        paymentDays: true,
        currency: true,
        country: true,
        contact: true,
        leadTimeDays: true,
        moq: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.catalogUpload.findMany({
      where: { tenantId },
      select: {
        id: true,
        brandId: true,
        season: true,
        itemCount: true,
        uploadedAt: true,
        brand: { select: { name: true } },
      },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.plannerCart.findUnique({ where: { tenantId }, select: { items: true } }),
  ]);

  return (
    <PlannerApp
      initialBrands={brands}
      initialCatalogs={catalogs.map((c) => ({
        ...c,
        uploadedAt: c.uploadedAt.toISOString(),
      }))}
      initialCart={parseCartItems(cart?.items)}
    />
  );
}
