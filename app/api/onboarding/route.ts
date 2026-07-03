import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const brief = await prisma.onboardingBrief.findUnique({ where: { tenantId } });
  return NextResponse.json(brief ?? null);
}

export async function POST(request: NextRequest) {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const { businessModel, answers } = await request.json();

  if (!businessModel || !answers) {
    return NextResponse.json({ error: "businessModel and answers required" }, { status: 400 });
  }

  const brief = await prisma.onboardingBrief.upsert({
    where: { tenantId },
    create: { tenantId, businessModel, answers },
    update: { businessModel, answers, completedAt: new Date() },
  });

  return NextResponse.json(brief);
}
