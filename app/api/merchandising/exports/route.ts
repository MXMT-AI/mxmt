import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import {
  createScenarioExport,
  readScenarioExportHistory,
  ScenarioExportError,
} from "@/lib/scenario-export-store";
import { scenarioExportApiError } from "@/lib/scenario-export-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Generate and audit files only for an authenticated analyst in the signed tenant. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { data, response: invalid } = await parseJsonBody<unknown>(
    request,
    undefined,
    4 * 1024 * 1024,
  );
  if (invalid) return invalid;
  try {
    return NextResponse.json(
      await createScenarioExport(user.tenantId, user.userId, data),
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return scenarioExportApiError(error);
  }
}
/** View the latest audit metadata without loading file bodies or full scenario rows. */
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser("VIEWER");
  if (response) return response;
  try {
    const q = request.nextUrl.searchParams,
      kind = q.get("kind");
    if (
      [...q.keys()].some((k) => k !== "kind") ||
      q.getAll("kind").length !== 1 ||
      (kind !== "reprice" && kind !== "reorder")
    )
      throw new ScenarioExportError("INVALID_EXPORT_KIND");
    return NextResponse.json(
      await readScenarioExportHistory(user.tenantId, kind),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return scenarioExportApiError(error);
  }
}
