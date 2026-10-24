import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/api-contracts";
import { enqueueOrderImport } from "@/lib/connectors/order-jobs";
import { parseOrderWebhook, webhookAuthorized } from "@/lib/connectors/order-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Authenticated relay only. Order data is re-read under the shared API budget. */
export async function POST(request: NextRequest, context: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await context.params;
  const headers = { "Cache-Control": "no-store" };
  if (!webhookAuthorized(sourceId, request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const body = await parseJsonBody(request, crypto.randomUUID(), 262_144);
  if (body.response) return body.response;
  try {
    const connection = await prisma.connectorConnection.findUnique({ where: { sourceId }, select: { tenantId: true, accountHost: true } });
    const event = connection && parseOrderWebhook(body.data, connection.accountHost);
    if (!connection || !event) return NextResponse.json({ error: "Invalid order event" }, { status: 400, headers });
    await enqueueOrderImport(connection.tenantId, "WEBHOOK", event);
    return NextResponse.json({ accepted: true }, { status: 202, headers });
  } catch {
    // Do not acknowledge and drop an event while the source is busy. The relay must retry.
    return NextResponse.json({ error: "Retry delivery later" }, { status: 503, headers: { ...headers, "Retry-After": "60" } });
  }
}
