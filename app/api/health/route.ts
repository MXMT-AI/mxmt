import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDataHealthReport } from "@/lib/data-health";
import { createRequestContext, logError, requestLogContext, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = createRequestContext(request, "api.health");

  try {
    await prisma.$queryRaw`SELECT 1`;
    const data = await getDataHealthReport();

    return withRequestId(NextResponse.json({
      ok: true,
      status: data.status === "ok" ? "healthy" : "degraded",
      checks: {
        app: "ok",
        database: "ok",
        data,
      },
      requestId: context.requestId,
      durationMs: Date.now() - context.startedAt,
      uptimeSec: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? "unknown",
      timestamp: new Date().toISOString(),
    }), context.requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError("Health check failed", error, requestLogContext(context));

    return withRequestId(NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        checks: {
          app: "ok",
          database: "error",
        },
        error: message,
        requestId: context.requestId,
        durationMs: Date.now() - context.startedAt,
        uptimeSec: Math.round(process.uptime()),
        environment: process.env.NODE_ENV ?? "unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    ), context.requestId);
  }
}
