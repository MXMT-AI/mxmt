import { NextRequest, NextResponse } from "next/server";
import { isDriveConfigured } from "@/lib/gdrive";
import {
  cronSecretMatches,
  runScheduledDataPipelines,
  scheduledImportDecision,
} from "@/lib/data-scheduler";

export async function handleScheduledDataImport(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }
  if (!cronSecretMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isDriveConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Google Drive is not configured" },
      { status: 503 }
    );
  }

  const decision = scheduledImportDecision();
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !decision.shouldRun) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "outside_schedule_window",
      schedule: decision,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  let results;
  try {
    results = await runScheduledDataPipelines(decision.businessDate);
  } catch (error) {
    console.error("[cron/data-import] Could not start scheduled pipelines", error);
    return NextResponse.json(
      { ok: false, error: "Could not load configured data sources", schedule: decision },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  const failures = results.filter((result) => !result.ok);
  return NextResponse.json({
    ok: failures.length === 0,
    skipped: false,
    schedule: decision,
    tenants: {
      total: results.length,
      succeeded: results.length - failures.length,
      failed: failures.length,
    },
    results,
  }, {
    status: failures.length === 0 ? 200 : 500,
    headers: { "Cache-Control": "no-store" },
  });
}
