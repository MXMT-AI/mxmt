import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDataHealthReport } from "@/lib/data-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const data = await getDataHealthReport();

    return NextResponse.json({
      ok: true,
      status: data.status === "ok" ? "healthy" : "degraded",
      checks: {
        app: "ok",
        database: "ok",
        data,
      },
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        checks: {
          app: "ok",
          database: "error",
        },
        error: message,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
