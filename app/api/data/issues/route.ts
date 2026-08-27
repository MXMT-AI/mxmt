import { NextRequest, NextResponse } from "next/server";
import { DataIssueSeverity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError } from "@/lib/api-contracts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const rawPage = Number(params.get("page"));
  const rawPageSize = Number(params.get("pageSize"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isInteger(rawPageSize)
    ? Math.min(200, Math.max(10, rawPageSize))
    : 50;
  const requestedRunId = params.get("importRunId")?.trim();
  const severityValue = params.get("severity")?.toUpperCase();
  if (severityValue && !Object.values(DataIssueSeverity).includes(severityValue as DataIssueSeverity)) {
    return apiError("Unknown issue severity", 400, "INVALID_SEVERITY");
  }
  const severity = severityValue && Object.values(DataIssueSeverity).includes(severityValue as DataIssueSeverity)
    ? severityValue as DataIssueSeverity
    : undefined;
  const code = params.get("code")?.trim().slice(0, 100) || undefined;

  let importRunId = requestedRunId;
  if (importRunId) {
    const exists = await prisma.dataImportRun.findFirst({ where: { id: importRunId, tenantId: user.tenantId }, select: { id: true } });
    if (!exists) return apiError("Import run not found", 404, "IMPORT_NOT_FOUND");
  } else {
    const source = await prisma.dataSource.findFirst({ where: { tenantId: user.tenantId, activeImportRunId: { not: null } }, select: { activeImportRunId: true } });
    importRunId = source?.activeImportRunId ?? undefined;
  }
  if (!importRunId) return apiError("No active data import", 409, "NO_ACTIVE_IMPORT");

  const where = { tenantId: user.tenantId, importRunId, ...(severity ? { severity } : {}), ...(code ? { code } : {}) };
  const [totalRows, rows] = await Promise.all([
    prisma.importIssue.count({ where }),
    prisma.importIssue.findMany({ where, orderBy: [{ severity: "desc" }, { rowNumber: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return NextResponse.json({ rows, pagination: { page, pageSize, totalRows, totalPages: Math.ceil(totalRows / pageSize) } });
}
