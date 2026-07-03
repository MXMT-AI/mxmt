import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const cart = await prisma.plannerCart.findUnique({ where: { tenantId } });
  return NextResponse.json({ items: cart?.items ?? [] });
}

export async function PUT(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const { items } = await request.json();

  await prisma.plannerCart.upsert({
    where: { tenantId },
    create: { tenantId, items: items ?? [] },
    update: { items: items ?? [] },
  });

  return NextResponse.json({ ok: true });
}
