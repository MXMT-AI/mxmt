import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody, stringField, validationError } from "@/lib/api-contracts";
import { apiCalendarEventsIdRouteMessages as englishCopy } from "@/messages/en.json";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;
  const { id } = await params;

  const event = await prisma.marketingEvent.findFirst({ where: { id, tenantId } });
  if (!event) return apiError(englishCopy.notFound, 404, "NOT_FOUND");

  await prisma.marketingEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;
  const { id } = await params;

  const event = await prisma.marketingEvent.findFirst({ where: { id, tenantId } });
  if (!event) return apiError(englishCopy.notFound, 404, "NOT_FOUND");

  const { data, response: parseResponse } = await parseJsonBody(req);
  if (parseResponse) return parseResponse;

  if (!isRecord(data)) {
    return validationError([englishCopy.bodyMustBeAnObject]);
  }

  const issues: string[] = [];
  const type = stringField(data, "type", issues, { maxLength: 40 });
  const label = stringField(data, "label", issues, { maxLength: 160 });

  if (!type && !label) {
    issues.push(englishCopy.atLeastOneOfTypeOr);
  }

  if (issues.length > 0) {
    return validationError(issues);
  }

  const updated = await prisma.marketingEvent.update({
    where: { id },
    data: {
      ...(type ? { type } : {}),
      ...(label ? { label } : {}),
    },
  });

  return NextResponse.json(updated);
}
