import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-contracts";
import { getRepricingPreview } from "@/lib/repricing-store";
import { repricingApiError } from "@/lib/repricing-api-error";
import { workspaceReportStorage } from "@/lib/workspace-report-storage";
import { readPublishedRepricingPreview } from "@/lib/merchandising-publication";
import { parseRepricingRequest } from "@/lib/repricing";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("VIEWER");
  if (response) return response;
  const { data, response: invalid } = await parseJsonBody<unknown>(
    request,
    undefined,
    4 * 1024 * 1024,
  );
  if (invalid) return invalid;
  try {
    const storage = await workspaceReportStorage(user.tenantId);
    const published = storage && await readPublishedRepricingPreview(user.tenantId, parseRepricingRequest(data), storage);
    return NextResponse.json(published ?? await getRepricingPreview(user.tenantId, data), {
      headers: {
        "Cache-Control": "no-store",
        "X-MXMT-Report-Source": published ? "published" : "postgres",
      },
    });
  } catch (error) {
    return repricingApiError(error);
  }
}
