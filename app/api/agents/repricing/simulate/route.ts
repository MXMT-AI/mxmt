import { NextRequest, NextResponse } from "next/server";
import { simulatePromo } from "@/lib/promo-calc";
import { requireApiUser } from "@/lib/server-auth";
import { isRecord, numberField, optionalDate, parseJsonBody, serverError, stringField, validationError } from "@/lib/api-contracts";

// Детермінований розрахунок акції по SKU бренда — без AI.
// Параметри сценарію (знижка, строк, прогноз) приходять з виводу Repricing-агента.

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
  const discountPercent = numberField(data, "discountPercent", issues, { required: true, min: 0, max: 100 });
  const durationDays = numberField(data, "durationDays", issues, { required: true, min: 1, max: 365 });
  const unitsToSellPercent = numberField(data, "unitsToSellPercent", issues, { min: 0, max: 100 });
  const asOf = optionalDate(data, "asOf", issues);
  const dateFrom = optionalDate(data, "dateFrom", issues);

  if (issues.length > 0) {
    return validationError(issues);
  }

  try {
    const result = await simulatePromo({
      tenantId,
      brandId: brandId!,
      discountPercent: discountPercent!,
      durationDays: durationDays!,
      unitsToSellPercent: unitsToSellPercent ?? null,
      asOf,
      dateFrom,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return serverError(msg);
  }
}
