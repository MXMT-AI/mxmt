import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import {
  projectSheetsImport,
  readSheetsProjectionIntent,
} from "@/lib/connectors/sheets-projection-store";
import { SheetsMappingError } from "@/lib/connectors/sheets-mapping-validation";
import { sheetsMappingApiError, sheetsMutationResponse } from "@/lib/connectors/sheets-mapping-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "source-id": string }> },
) {
  return sheetsMutationResponse(request, params, projectSheetsImport, {
    maxBytes: 4096,
    queryError: "INVALID_SHEETS_PROJECTION_REQUEST",
    trackRequest: true,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ "source-id": string }> },
) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  try {
    if (request.nextUrl.search)
      throw new SheetsMappingError("INVALID_SHEETS_PROJECTION_REQUEST");
    return NextResponse.json(
      await readSheetsProjectionIntent(
        { tenantId: user.tenantId, userId: user.userId },
        (await params)["source-id"],
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return sheetsMappingApiError(error);
  }
}
