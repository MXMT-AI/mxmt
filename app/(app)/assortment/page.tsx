import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import PlannerApp from "@/components/planner/PlannerApp";

export default async function AssortmentPage() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const [brands, catalogs, cart] = await Promise.all([
    prisma.brand.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
    prisma.catalogUpload.findMany({
      where: { tenantId },
      include: { brand: { select: { name: true } } },
      orderBy: { uploadedAt: "desc" },
    }),
    prisma.plannerCart.findUnique({ where: { tenantId } }),
  ]);

  return (
    <PlannerApp
      initialBrands={brands}
      initialCatalogs={catalogs.map((c) => ({
        ...c,
        uploadedAt: c.uploadedAt.toISOString(),
      }))}
      initialCart={(cart?.items as object[]) ?? []}
    />
  );
}
