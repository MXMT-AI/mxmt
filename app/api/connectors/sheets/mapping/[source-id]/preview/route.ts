import type { NextRequest } from "next/server";
import { previewSheetsMapping } from "@/lib/connectors/sheets-mapping-store";
import { sheetsMutationResponse } from "@/lib/connectors/sheets-mapping-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ "source-id": string }> },
) {
  return sheetsMutationResponse(request, params, previewSheetsMapping, {
    maxBytes: 65_536,
    queryError: "INVALID_SHEETS_MAPPING_REQUEST",
  });
}
