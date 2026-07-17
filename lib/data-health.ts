import { prisma } from "@/lib/prisma";

export interface DataHealthIssue {
  code: string;
  count: number;
  severity: "warning" | "error";
}

export interface DataHealthReport {
  status: "ok" | "degraded";
  issues: DataHealthIssue[];
}

async function countQuery(query: TemplateStringsArray): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(query);
  return Number(rows[0]?.count ?? 0);
}

export async function getDataHealthReport(): Promise<DataHealthReport> {
  const [
    negativeInventory,
    negativeSales,
    staleDriveSyncs,
    staleAgentRuns,
    catalogCountMismatches,
  ] = await Promise.all([
    countQuery`SELECT COUNT(*)::bigint AS count FROM "InventorySnapshot" WHERE "qtyOnHand" < 0 OR "qtyReserved" < 0 OR "qtyInTransit" < 0`,
    countQuery`SELECT COUNT(*)::bigint AS count FROM "SalesRecord" WHERE "qtySold" < 0 OR revenue < 0 OR returns < 0`,
    countQuery`SELECT COUNT(*)::bigint AS count FROM "GoogleDriveSync" WHERE "syncStatus" = 'running' AND "lastSyncAt" IS NOT NULL AND "lastSyncAt" < NOW() - INTERVAL '30 minutes'`,
    countQuery`SELECT COUNT(*)::bigint AS count FROM "AgentRun" WHERE status = 'running' AND "startedAt" < NOW() - INTERVAL '2 hours'`,
    countQuery`
      SELECT COUNT(*)::bigint AS count
      FROM "CatalogUpload" upload
      LEFT JOIN (
        SELECT "catalogId", COUNT(*)::int AS actual_count
        FROM "CatalogItem"
        GROUP BY "catalogId"
      ) item_counts ON item_counts."catalogId" = upload.id
      WHERE upload."itemCount" <> COALESCE(item_counts.actual_count, 0)
    `,
  ]);

  const checks: DataHealthIssue[] = [
    { code: "negative_inventory_quantities", count: negativeInventory, severity: "error" },
    { code: "negative_sales_values", count: negativeSales, severity: "error" },
    { code: "stale_drive_syncs", count: staleDriveSyncs, severity: "warning" },
    { code: "stale_agent_runs", count: staleAgentRuns, severity: "warning" },
    { code: "catalog_item_count_mismatches", count: catalogCountMismatches, severity: "warning" },
  ];
  const issues = checks.filter((issue) => issue.count > 0);

  return {
    status: issues.length > 0 ? "degraded" : "ok",
    issues,
  };
}
