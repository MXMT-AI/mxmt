import { NextResponse } from "next/server";
import { DataRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SHEETS_SOURCE_FILTER } from "@/lib/data-source";
import { requireApiUser } from "@/lib/server-auth";
import { ARTICLE_CALCULATION_VERSION } from "@/lib/article-report";
import { DATA_TABLE_KEYS } from "@/lib/data-table-api";
import { readDriveConnection } from "@/lib/drive-connection";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const [connection, source] = await Promise.all([readDriveConnection(user.tenantId), prisma.dataSource.findFirst({
    where: { tenantId: user.tenantId, ...SHEETS_SOURCE_FILTER },
    orderBy: { updatedAt: "desc" },
    include: {
      activeImportRun: true,
      importRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  })]);
  const active = source?.activeImportRun ?? null;
  const [calculation, issueCounts] = active
    ? await Promise.all([
        prisma.reportCalculationRun.findFirst({
          where: {
            tenantId: user.tenantId,
            importRunId: active.id,
            calculationVersion: ARTICLE_CALCULATION_VERSION,
            status: { in: [DataRunStatus.SUCCESS, DataRunStatus.WARNING] },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.importIssue.groupBy({
          by: ["severity"],
          where: { tenantId: user.tenantId, importRunId: active.id },
          _count: { _all: true },
        }),
      ])
    : [null, []];
  return NextResponse.json({
    connection,
    configured: Boolean(source),
    source: source ? {
      id: source.id,
      name: source.name,
      timezone: source.timezone,
      driveFileId: source.driveFileId,
      updatedAt: source.updatedAt,
    } : null,
    activeImport: active,
    latestImport: source?.importRuns[0] ?? null,
    calculation,
    issueCounts: Object.fromEntries(issueCounts.map((item) => [item.severity, item._count._all])),
    tables: DATA_TABLE_KEYS,
  });
}
