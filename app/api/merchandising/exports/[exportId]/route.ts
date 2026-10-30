import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import {
  readScenarioExportFile,
  ScenarioExportError,
} from "@/lib/scenario-export-store";
import { scenarioExportApiError } from "@/lib/scenario-export-api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  try {
    const q = request.nextUrl.searchParams;
    if (
      [...q.keys()].some((k) => k !== "fileId") ||
      q.getAll("fileId").length !== 1
    )
      throw new ScenarioExportError("EXPORT_NOT_FOUND", 404);
    const file = await readScenarioExportFile(
      user.tenantId,
      (await params).exportId,
      q.get("fileId") ?? "",
    );
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return scenarioExportApiError(error);
  }
}
