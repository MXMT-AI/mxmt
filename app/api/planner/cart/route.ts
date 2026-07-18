import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, parseJsonBody, validationError } from "@/lib/api-contracts";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const { tenantId } = user;

  const cart = await prisma.plannerCart.findUnique({ where: { tenantId } });
  return NextResponse.json({ items: cart?.items ?? [] });
}

export async function PUT(request: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const { data, response: parseResponse } = await parseJsonBody(request);
  if (parseResponse) return parseResponse;

  if (!isRecord(data)) {
    return validationError(["body must be an object"]);
  }

  const items = data.items;
  if (!Array.isArray(items)) {
    return validationError(["items must be an array"]);
  }

  await prisma.plannerCart.upsert({
    where: { tenantId },
    create: { tenantId, items },
    update: { items },
  });

  return NextResponse.json({ ok: true });
}
