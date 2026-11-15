import { type NextRequest, NextResponse } from "next/server";
import { loadAnalystClassification } from "@/lib/analyst-classification";
import { requireApiUser } from "@/lib/server-auth";

export type { ClassifiedSku, SkuFlag } from "@/lib/analyst-types";

export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;

  const { searchParams } = request.nextUrl;
  const flag = searchParams.get("flag");
  const { skus, summary } = await loadAnalystClassification(user.tenantId, {
    brand: searchParams.get("brand"),
    category: searchParams.get("category"),
  });

  return NextResponse.json({
    skus: flag ? skus.filter((sku) => sku.flag === flag) : skus,
    summary,
  });
}
