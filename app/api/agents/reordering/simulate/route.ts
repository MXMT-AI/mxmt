import { NextRequest, NextResponse } from "next/server";
import { simulateReorder } from "@/lib/reorder-calc";
import { requireApiUser } from "@/lib/server-auth";

// Детермінований розрахунок дозамовлення по SKU бренда — без AI.
// Параметри сценарію (множник обʼєму) приходять з виводу Reordering-агента.

export async function POST(req: NextRequest) {
  const { user, response } = await requireApiUser("ANALYST");
  if (response) return response;
  const { tenantId } = user;

  const body = await req.json().catch(() => ({}));
  const brandId: string | undefined = body.brandId;
  const qtyMultiplier = Number(body.qtyMultiplier);

  if (!brandId || !Number.isFinite(qtyMultiplier) || qtyMultiplier <= 0) {
    return NextResponse.json({ error: "Потрібні brandId і qtyMultiplier > 0" }, { status: 400 });
  }

  try {
    const result = await simulateReorder({
      tenantId,
      brandId,
      qtyMultiplier,
      asOf: body.asOf ? new Date(body.asOf) : undefined,
      dateFrom: body.dateFrom ? new Date(body.dateFrom) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
