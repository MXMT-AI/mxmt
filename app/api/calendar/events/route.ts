import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const events = await prisma.marketingEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const { weekKey, rowKey, type, label } = await request.json();

  if (!weekKey || !rowKey || !type || !label) {
    return NextResponse.json({ error: "All fields required" }, { status: 400 });
  }

  const event = await prisma.marketingEvent.create({
    data: { tenantId, weekKey, rowKey, type, label, source: "user" },
  });

  return NextResponse.json(event, { status: 201 });
}
