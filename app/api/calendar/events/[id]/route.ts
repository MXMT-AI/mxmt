import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;
  const { id } = await params;

  const event = await prisma.marketingEvent.findFirst({ where: { id, tenantId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.marketingEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;
  const { id } = await params;

  const event = await prisma.marketingEvent.findFirst({ where: { id, tenantId } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.marketingEvent.update({
    where: { id },
    data: {
      ...(body.type ? { type: body.type } : {}),
      ...(body.label ? { label: body.label } : {}),
    },
  });

  return NextResponse.json(updated);
}
