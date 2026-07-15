import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const brief = await prisma.onboardingBrief.findUnique({ where: { tenantId } });
  return NextResponse.json(brief ?? null);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

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
