import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const cart = await prisma.plannerCart.findUnique({ where: { tenantId } });
  return NextResponse.json({ items: cart?.items ?? [] });
}

export async function PUT(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const { items } = await request.json();

  await prisma.plannerCart.upsert({
    where: { tenantId },
    create: { tenantId, items: items ?? [] },
    update: { items: items ?? [] },
  });

  return NextResponse.json({ ok: true });
}
