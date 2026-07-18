import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, numberField, parseJsonBody, stringField, validationError } from "@/lib/api-contracts";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

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
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const { data, response: parseResponse } = await parseJsonBody(request);
  if (parseResponse) return parseResponse;

  if (!isRecord(data)) {
    return validationError(["body must be an object"]);
  }

  const issues: string[] = [];
  const name = stringField(data, "name", issues, { required: true, maxLength: 120 });
  const currency = stringField(data, "currency", issues, { maxLength: 8 }) ?? "EUR";
  const country = stringField(data, "country", issues, { maxLength: 80 }) ?? null;
  const contact = stringField(data, "contact", issues, { maxLength: 200 }) ?? null;
  const budget = numberField(data, "budget", issues, { min: 0 }) ?? 0;
  const paymentDays = numberField(data, "paymentDays", issues, { min: 0, max: 365 }) ?? 30;
  const leadTimeDays = numberField(data, "leadTimeDays", issues, { min: 1, max: 365 }) ?? 28;
  const moq = numberField(data, "moq", issues, { min: 1 }) ?? 1;

  if (issues.length > 0) {
    return validationError(issues);
  }

  const brand = await prisma.brand.create({
    data: {
      tenantId,
      name: name!,
      budget,
      paymentDays,
      currency,
      country,
      contact,
      leadTimeDays,
      moq,
    },
  });

  return NextResponse.json(brand, { status: 201 });
}
