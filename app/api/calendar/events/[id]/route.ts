import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;
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
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;
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
