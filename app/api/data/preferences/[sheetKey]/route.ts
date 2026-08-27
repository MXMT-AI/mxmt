import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody, validationError } from "@/lib/api-contracts";
import { isDataTableKey } from "@/lib/data-table-api";

async function sheetKeyFrom(params: Promise<{ sheetKey: string }>) {
  const { sheetKey } = await params;
  return isDataTableKey(sheetKey) ? sheetKey : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sheetKey: string }> }
) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const sheetKey = await sheetKeyFrom(params);
  if (!sheetKey) return apiError("Unknown table", 404, "TABLE_NOT_FOUND");

  const preference = await prisma.dataTablePreference.findFirst({
    where: { tenantId: user.tenantId, userId: user.userId, sheetKey },
  });
  return NextResponse.json(preference ?? {
    sheetKey,
    visibleColumns: [],
    pageSize: 50,
    sortColumn: null,
    sortDirection: null,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sheetKey: string }> }
) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const sheetKey = await sheetKeyFrom(params);
  if (!sheetKey) return apiError("Unknown table", 404, "TABLE_NOT_FOUND");
  const { data, response: parseResponse } = await parseJsonBody(request);
  if (parseResponse) return parseResponse;
  if (!isRecord(data)) return validationError(["body must be an object"]);

  const issues: string[] = [];
  let visibleColumns: string[] | undefined;
  if (data.visibleColumns !== undefined) {
    if (!Array.isArray(data.visibleColumns) || data.visibleColumns.some((item) => typeof item !== "string")) {
      issues.push("visibleColumns must be an array of strings");
    } else {
      visibleColumns = [...new Set(data.visibleColumns.map((item) => item.trim()).filter(Boolean))].slice(0, 200);
    }
  }
  let pageSize: number | undefined;
  if (data.pageSize !== undefined) {
    pageSize = Number(data.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 10 || pageSize > 200) {
      issues.push("pageSize must be an integer between 10 and 200");
    }
  }
  const sortColumn = data.sortColumn === null
    ? null
    : typeof data.sortColumn === "string"
      ? data.sortColumn.trim().slice(0, 80) || null
      : undefined;
  if (data.sortColumn !== undefined && data.sortColumn !== null && typeof data.sortColumn !== "string") {
    issues.push("sortColumn must be a string or null");
  }
  const sortDirection = data.sortDirection === null
    ? null
    : data.sortDirection === "asc" || data.sortDirection === "desc"
      ? data.sortDirection
      : undefined;
  if (data.sortDirection !== undefined && sortDirection === undefined) {
    issues.push("sortDirection must be asc, desc, or null");
  }
  if (issues.length > 0) return validationError(issues);

  const current = await prisma.dataTablePreference.findFirst({
    where: { tenantId: user.tenantId, userId: user.userId, sheetKey },
  });
  const update = {
    ...(visibleColumns ? { visibleColumns: visibleColumns as Prisma.InputJsonValue } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(data.sortColumn !== undefined ? { sortColumn } : {}),
    ...(data.sortDirection !== undefined ? { sortDirection } : {}),
  };
  const preference = current
    ? await prisma.dataTablePreference.update({ where: { id: current.id }, data: update })
    : await prisma.dataTablePreference.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          sheetKey,
          visibleColumns: (visibleColumns ?? []) as Prisma.InputJsonValue,
          pageSize: pageSize ?? 50,
          sortColumn: sortColumn ?? null,
          sortDirection: sortDirection ?? null,
        },
      });
  return NextResponse.json(preference);
}
