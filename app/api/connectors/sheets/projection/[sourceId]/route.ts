import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import { projectSheetsImport } from "@/lib/connectors/sheets-projection-store";
import { SheetsMappingError } from "@/lib/connectors/sheets-mapping-validation";
import { sheetsMappingApiError } from "@/lib/connectors/sheets-mapping-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Explicit projection intent; never fetches the workbook or changes source selection/approval. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { data, response: invalid } = await parseJsonBody(
    request,
    undefined,
    4096,
  );
  if (invalid) return invalid;
  try {
    if (request.nextUrl.search)
      throw new SheetsMappingError("INVALID_SHEETS_PROJECTION_REQUEST");
    return NextResponse.json(
      await projectSheetsImport(
        { tenantId: user.tenantId, userId: user.userId },
        (await params).sourceId,
        data,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return sheetsMappingApiError(error);
  }
}
