import { prisma } from "@/lib/prisma";

/**
 * Resolve the immutable source snapshot that currently powers reporting.
 * Agents must use this import rather than the legacy Sku/SalesRecord tables,
 * which were populated directly from the workbook by the old sync pipeline.
 */
export async function getActiveAgentImportRunId(tenantId: string): Promise<string | null> {
  const source = await prisma.dataSource.findFirst({
    where: {
      tenantId,
      activeImportRunId: { not: null },
      activeImportRun: { status: { in: ["SUCCESS", "WARNING"] } },
    },
    orderBy: { updatedAt: "desc" },
    select: { activeImportRunId: true },
  });

  return source?.activeImportRunId ?? null;
}

export function brandValueFromAgentId(brandId: string): string | null {
  if (brandId === "brand:null" || brandId === "__unbranded__") return null;
  if (brandId.startsWith("brand:value:")) return brandId.slice("brand:value:".length);
  throw new Error("Застарілий ідентифікатор бренду. Перезапустіть агента на новій базі.");
}
