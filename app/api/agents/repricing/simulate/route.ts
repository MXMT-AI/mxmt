import { NextRequest, NextResponse } from "next/server";
import { simulatePromo } from "@/lib/promo-calc";
import { requireApiUser } from "@/lib/server-auth";

// Детермінований розрахунок акції по SKU бренда — без AI.
// Параметри сценарію (знижка, строк, прогноз) приходять з виводу Repricing-агента.

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const brandId: string | undefined = body.brandId;
  const discountPercent = Number(body.discountPercent);
  const durationDays = Number(body.durationDays);

  if (!brandId || !Number.isFinite(discountPercent) || !Number.isFinite(durationDays) || durationDays <= 0) {
    return NextResponse.json(
      { error: "Потрібні brandId, discountPercent і durationDays" },
      { status: 400 }
    );
  }

  try {
    const result = await simulatePromo({
      tenantId,
      brandId,
      discountPercent,
      durationDays,
      unitsToSellPercent:
        body.unitsToSellPercent != null && Number.isFinite(Number(body.unitsToSellPercent))
          ? Number(body.unitsToSellPercent)
          : null,
      asOf: body.asOf ? new Date(body.asOf) : undefined,
      dateFrom: body.dateFrom ? new Date(body.dateFrom) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
