import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, serverError } from "@/lib/api-contracts";
import {
  DataTableApiError,
  getDataTable,
  isDataTableKey,
  parseDataTableQuery,
} from "@/lib/data-table-api";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sheetKey: string }> }
) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { sheetKey } = await params;
  if (!isDataTableKey(sheetKey)) return apiError("Unknown table", 404, "TABLE_NOT_FOUND");

  try {
    const result = await getDataTable(
      user.tenantId,
      sheetKey,
      parseDataTableQuery(new URL(request.url).searchParams)
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DataTableApiError) {
      return apiError(error.message, error.status, error.code);
    }
    console.error(`[data/tables/${sheetKey}]`, error);
    return serverError("Could not load data table");
  }
}
