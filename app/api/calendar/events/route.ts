import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const events = await prisma.marketingEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const { weekKey, rowKey, type, label } = await request.json();

  if (!weekKey || !rowKey || !type || !label) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  const event = await prisma.marketingEvent.create({
    data: { tenantId, weekKey, rowKey, type, label, source: "user" },
  });

  return NextResponse.json(event, { status: 201 });
}
