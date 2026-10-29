import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import { previewSheetsMapping } from "@/lib/connectors/sheets-mapping-store";
import { SheetsMappingError } from "@/lib/connectors/sheets-mapping-validation";
import { sheetsMappingApiError } from "@/lib/connectors/sheets-mapping-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Mapping intent is separate from import, report-source selection and calculation. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { data, response: invalid } = await parseJsonBody(
    request,
    undefined,
    65536,
  );
  if (invalid) return invalid;
  try {
    if (request.nextUrl.search)
      throw new SheetsMappingError("INVALID_SHEETS_MAPPING_REQUEST");
    return NextResponse.json(
      await previewSheetsMapping(
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
