import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, parseJsonBody, stringField, validationError } from "@/lib/api-contracts";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const events = await prisma.marketingEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(events);
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
  const weekKey = stringField(data, "weekKey", issues, { required: true, maxLength: 16 });
  const rowKey = stringField(data, "rowKey", issues, { required: true, maxLength: 40 });
  const type = stringField(data, "type", issues, { required: true, maxLength: 40 });
  const label = stringField(data, "label", issues, { required: true, maxLength: 160 });

  if (issues.length > 0) {
    return validationError(issues);
  }

  const event = await prisma.marketingEvent.create({
    data: { tenantId, weekKey: weekKey!, rowKey: rowKey!, type: type!, label: label!, source: "user" },
  });

  return NextResponse.json(event, { status: 201 });
}
