import { NextRequest, NextResponse } from "next/server";
import { simulateReorder } from "@/lib/reorder-calc";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, numberField, optionalDate, parseJsonBody, serverError, stringField, validationError } from "@/lib/api-contracts";

// Детермінований розрахунок дозамовлення по SKU бренда — без AI.
// Параметри сценарію (множник обʼєму) приходять з виводу Reordering-агента.

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const { data, response: parseResponse } = await parseJsonBody(req);
  if (parseResponse) return parseResponse;

  if (!isRecord(data)) {
    return validationError(["body must be an object"]);
  }

  const issues: string[] = [];
  const brandId = stringField(data, "brandId", issues, { required: true });
  const qtyMultiplier = numberField(data, "qtyMultiplier", issues, { required: true, min: 0.5, max: 1.5 });
  const asOf = optionalDate(data, "asOf", issues);
  const dateFrom = optionalDate(data, "dateFrom", issues);

  if (qtyMultiplier !== undefined && ![0.5, 1, 1.5].includes(qtyMultiplier)) {
    issues.push("qtyMultiplier must be one of 0.5, 1, 1.5");
  }

  if (issues.length > 0) {
    return validationError(issues);
  }

  try {
    const result = await simulateReorder({
      tenantId,
      brandId: brandId!,
      qtyMultiplier: qtyMultiplier!,
      asOf,
      dateFrom,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return serverError(msg);
  }
}
