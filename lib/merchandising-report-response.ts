import { NextResponse } from "next/server";
import type { ReportPublicationStorage } from "./merchandising-publication-storage";
import { workspaceReportStorage } from "./workspace-report-storage";

export async function merchandisingReportResponse<T>(
  tenantId: string,
  readPublished: (storage: ReportPublicationStorage) => Promise<T | null>,
  readLive: () => Promise<T>,
  status = 200,
) {
  const storage = await workspaceReportStorage(tenantId);
  const published = storage && await readPublished(storage);
  return NextResponse.json(published ?? await readLive(), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-MXMT-Report-Source": published === null ? "postgres" : "published",
    },
  });
}
