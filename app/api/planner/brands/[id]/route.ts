import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, numberField, parseJsonBody, stringField, validationError } from "@/lib/api-contracts";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;
  const { id } = await params;

  const brand = await prisma.brand.findFirst({ where: { id, tenantId } });
  if (!brand) return apiError("Not found", 404, "NOT_FOUND");

  const { data, response: parseResponse } = await parseJsonBody(request);
  if (parseResponse) return parseResponse;

  if (!isRecord(data)) {
    return validationError(["body must be an object"]);
  }

  const issues: string[] = [];
  const name = stringField(data, "name", issues, { maxLength: 120 }) ?? brand.name;
  const currency = stringField(data, "currency", issues, { maxLength: 8 }) ?? brand.currency;
  const country = data.country === null ? null : stringField(data, "country", issues, { maxLength: 80 }) ?? brand.country;
  const contact = data.contact === null ? null : stringField(data, "contact", issues, { maxLength: 200 }) ?? brand.contact;
  const budget = numberField(data, "budget", issues, { min: 0 }) ?? brand.budget;
  const paymentDays = numberField(data, "paymentDays", issues, { min: 0, max: 365 }) ?? brand.paymentDays;
  const leadTimeDays = numberField(data, "leadTimeDays", issues, { min: 1, max: 365 }) ?? brand.leadTimeDays;
  const moq = numberField(data, "moq", issues, { min: 1 }) ?? brand.moq;

  if (issues.length > 0) {
    return validationError(issues);
  }

  const existing = await prisma.brand.findFirst({
    where: {
      tenantId,
      id: { not: id },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (existing) {
    return apiError("Brand already exists", 409, "BRAND_ALREADY_EXISTS");
  }

  try {
    const updated = await prisma.brand.update({
      where: { id },
      data: {
        name,
        budget,
        paymentDays,
        currency,
        country,
        contact,
        leadTimeDays,
        moq,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError("Brand already exists", 409, "BRAND_ALREADY_EXISTS");
    }

    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const { tenantId } = user;
  const { id } = await params;

  const brand = await prisma.brand.findFirst({ where: { id, tenantId } });
  if (!brand) return apiError("Not found", 404, "NOT_FOUND");

  await prisma.brand.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
