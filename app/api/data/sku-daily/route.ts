import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { apiError } from "@/lib/api-contracts";
import {
  calculateSkuDaily,
  readSkuDaily,
  DailySkuError,
  DAILY_SKU_SORTS,
  type DailySkuQuery,
} from "@/lib/sku-daily-store";
import { DailySkuPeriodError } from "@/lib/sku-daily-period";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
/** Readers consume one immutable tenant calculation; pagination never changes the availability denominator. */
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const p = request.nextUrl.searchParams,
    id = p.get("calculationId"),
    asOf = p.get("asOf"),
    page = Number(p.get("page") ?? 1),
    pageSize = Number(p.get("pageSize") ?? 25),
    q = p.get("q") ?? "",
    sort = p.get("sort") ?? "sku",
    direction = p.get("direction") ?? "asc";
  if (
    (id !== null && (!id || id.length > 200)) ||
    (asOf !== null && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) ||
    (id && asOf) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200 ||
    q.length > 200 ||
    !DAILY_SKU_SORTS.includes(sort as DailySkuQuery["sort"]) ||
    !["asc", "desc"].includes(direction)
  )
    return apiError("Invalid daily SKU query", 400, "INVALID_QUERY");
  try {
    const calculationId =
      id ??
      (await calculateSkuDaily(user.tenantId, { asOf: asOf ?? undefined }))
        .calculationId;
    const result = await readSkuDaily(user.tenantId, calculationId, {
      page,
      pageSize,
      q,
      sort: sort as DailySkuQuery["sort"],
      direction: direction as "asc" | "desc",
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DailySkuPeriodError)
      return apiError(error.message, 400, "INVALID_AS_OF");
    if (error instanceof DailySkuError)
      return apiError(
        "Daily SKU metrics unavailable. Check source settings, import progress and selected date.",
        error.status,
        error.code,
      );
    return apiError(
      "Could not calculate daily SKU metrics. Retry after synchronization completes.",
      503,
      "DAILY_CALCULATION_UNAVAILABLE",
    );
  }
}
