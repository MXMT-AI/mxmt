import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const brands = await prisma.brand.findMany({
    where: { tenantId },
    include: {
      _count: { select: { catalogUploads: true, catalogItems: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(brands);
}

export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const body = await request.json();
  const { name, budget, paymentDays, currency, country, contact, leadTimeDays, moq } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const brand = await prisma.brand.create({
    data: {
      tenantId,
      name,
      budget: budget ?? 0,
      paymentDays: paymentDays ?? 30,
      currency: currency ?? "EUR",
      country: country ?? null,
      contact: contact ?? null,
      leadTimeDays: leadTimeDays ?? 28,
      moq: moq ?? 1,
    },
  });

  return NextResponse.json(brand, { status: 201 });
}
