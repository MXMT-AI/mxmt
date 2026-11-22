import { NextRequest, NextResponse } from "next/server";
import { BusinessModel, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, parseJsonBody, stringField, validationError } from "@/lib/api-contracts";
import { apiOnboardingRouteMessages as englishCopy } from "@/messages/en.json";

const BUSINESS_MODELS = new Set<BusinessModel>(["SEASONAL", "CARRYOVER", "HYBRID"]);

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const brief = await prisma.onboardingBrief.findUnique({ where: { tenantId } });
  return NextResponse.json(brief ?? null);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { tenantId } = user;

  const { data, response: parseResponse } = await parseJsonBody(request);
  if (parseResponse) return parseResponse;

  const issues: string[] = [];
  if (!isRecord(data)) {
    return validationError([englishCopy.bodyMustBeAnObject]);
  }

  const businessModel = stringField(data, "businessModel", issues, { required: true });
  if (businessModel && !BUSINESS_MODELS.has(businessModel as BusinessModel)) {
    issues.push(englishCopy.businessModelMustBeOneOfSEASONAL);
  }

  const answers = data.answers;
  if (!isRecord(answers)) {
    issues.push(englishCopy.answersMustBeAnObject);
  }

  if (issues.length > 0) {
    return validationError(issues);
  }

  const brief = await prisma.onboardingBrief.upsert({
    where: { tenantId },
    create: { tenantId, businessModel: businessModel as BusinessModel, answers: answers as Prisma.InputJsonValue },
    update: { businessModel: businessModel as BusinessModel, answers: answers as Prisma.InputJsonValue, completedAt: new Date() },
  });

  return NextResponse.json(brief);
}
