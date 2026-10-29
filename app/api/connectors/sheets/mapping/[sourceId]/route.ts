import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { readSheetsMappingMetadata } from "@/lib/connectors/sheets-mapping-store";
import { SheetsMappingError } from "@/lib/connectors/sheets-mapping-validation";
import { sheetsMappingApiError } from "@/lib/connectors/sheets-mapping-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  try {
    if (request.nextUrl.search)
      throw new SheetsMappingError("INVALID_SHEETS_MAPPING_REQUEST");
    return NextResponse.json(
      await readSheetsMappingMetadata(
        { tenantId: user.tenantId, userId: user.userId },
        (await params).sourceId,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return sheetsMappingApiError(error);
  }
}
