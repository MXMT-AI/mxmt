import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;
  const { id } = await params;

  const brand = await prisma.brand.findFirst({ where: { id, tenantId } });
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const updated = await prisma.brand.update({
    where: { id },
    data: {
      name: body.name ?? brand.name,
      budget: body.budget ?? brand.budget,
      paymentDays: body.paymentDays ?? brand.paymentDays,
      currency: body.currency ?? brand.currency,
      country: body.country ?? brand.country,
      contact: body.contact ?? brand.contact,
      leadTimeDays: body.leadTimeDays ?? brand.leadTimeDays,
      moq: body.moq ?? brand.moq,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;
  const { id } = await params;

  const brand = await prisma.brand.findFirst({ where: { id, tenantId } });
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.brand.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
