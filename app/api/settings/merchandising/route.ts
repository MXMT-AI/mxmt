import { createMerchandisingBrand } from "@/lib/merchandising-brand";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/server-auth";
import { apiError, isRecord, parseJsonBody } from "@/lib/api-contracts";
import {
  SettingsValidationError,
  type SettingsResource,
} from "@/lib/merchandising-settings";
import {
  getEffectiveSkuSettings,
  listMerchandisingSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
import {
  previewMerchandisingCalculations,
  evaluateMonthlyPlan,
} from "@/lib/merchandising-policy";
export const dynamic = "force-dynamic";
const resources = ["client", "brand", "sku", "supplier", "category"];
const headers = { "Cache-Control": "no-store" };
/** Tenant-scoped configuration reads and resolved SKU policy never trust caller identity fields. */
export async function GET(request: NextRequest) {
  const { user, response } = await requireApiUser();
  if (response) return response;
  const p = request.nextUrl.searchParams,
    resource = p.get("resource") ?? "client",
    page = Number(p.get("page") ?? 1),
    q = p.get("q") ?? "",
    sku = p.get("skuId");
  if (
    !resources.includes(resource) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    q.length > 200 ||
    (sku && sku.length > 200)
  )
    return apiError("Invalid settings query", 400, "INVALID_QUERY");
  try {
    return NextResponse.json(
      sku
        ? await getEffectiveSkuSettings(user.tenantId, sku)
        : await listMerchandisingSettings(
            user.tenantId,
            resource as SettingsResource,
            page,
            q,
          ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
/** Role-protected writes create validated revisions; previews read persisted policy instead of request settings. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireApiUser("ADMIN");
  if (response) return response;
  const body = await parseJsonBody(request, crypto.randomUUID(), 65536);
  if (body.response) return body.response;
  const value = body.data;
  if (!isRecord(value))
    return apiError("Invalid action", 400, "INVALID_ACTION");
  try {
    if (value.action === "createBrand")
      return NextResponse.json(
        await createMerchandisingBrand(user.tenantId, user.userId, value.name),
        { headers },
      );
    if (
      value.action === "preview" &&
      typeof value.skuId === "string" &&
      value.skuId.length <= 200 &&
      isRecord(value.inputs)
    ) {
      const input = value.inputs;
      for (const field of [
        "revenue",
        "cost",
        "weeklyVelocity",
        "stock",
        "inTransit",
      ])
        if (
          !(input[field] === null && ["cost", "inTransit"].includes(field)) &&
          (typeof input[field] !== "string" ||
            !/^\d{1,14}(\.\d{1,4})?$/.test(input[field] as string))
        )
          throw new SettingsValidationError({ [field]: "invalid_decimal" });
      if (
        !Number.isInteger(input.month) ||
        (input.month as number) < 1 ||
        (input.month as number) > 12
      )
        throw new SettingsValidationError({ month: "invalid_months" });
      if (
        input.planMonth !== undefined &&
        (typeof input.planMonth !== "string" ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.planMonth))
      )
        throw new SettingsValidationError({ planMonth: "invalid_months" });
      const effective = await getEffectiveSkuSettings(
        user.tenantId,
        value.skuId,
      );
      return NextResponse.json(
        {
          ...effective,
          monthlyPlan:
            typeof input.planMonth === "string"
              ? evaluateMonthlyPlan(
                  effective.client.values,
                  input.planMonth,
                  input.revenue as string,
                )
              : null,
          preview: previewMerchandisingCalculations(
            effective.policy,
            input as unknown as Parameters<
              typeof previewMerchandisingCalculations
            >[1],
          ),
        },
        { headers },
      );
    }
    if (
      value.action !== "save" ||
      typeof value.resource !== "string" ||
      !resources.includes(value.resource) ||
      !(
        value.id === null ||
        (typeof value.id === "string" && value.id.length <= 200)
      ) ||
      typeof value.expectedRevision !== "number"
    )
      return apiError("Invalid settings action", 400, "INVALID_ACTION");
    if (
      value.resource === "supplier" &&
      value.id === null &&
      (typeof value.creationKey !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          value.creationKey,
        ))
    )
      return apiError("A creation key is required", 400, "INVALID_ACTION");
    return NextResponse.json(
      await saveMerchandisingSettings(
        user.tenantId,
        user.userId,
        value.resource as SettingsResource,
        value.id as string | null,
        value.expectedRevision,
        value.values,
        undefined,
        {
          creationKey:
            typeof value.creationKey === "string"
              ? value.creationKey
              : undefined,
        },
      ),
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
/** Return fixed public codes and field errors; database/customer payloads stay private. */
function failure(error: unknown) {
  if (error instanceof SettingsValidationError)
    return NextResponse.json(
      {
        error: "Check settings fields",
        code: "INVALID_SETTINGS",
        fields: error.fields,
      },
      { status: 400, headers },
    );
  const code =
    error instanceof Error &&
    ["ENTITY_NOT_FOUND", "SETTINGS_CONFLICT"].includes(error.message)
      ? error.message
      : "SETTINGS_UNAVAILABLE";
  return NextResponse.json(
    { error: "Settings could not be loaded or saved", code },
    {
      status:
        code === "ENTITY_NOT_FOUND"
          ? 404
          : code === "SETTINGS_CONFLICT"
            ? 409
            : 503,
      headers,
    },
  );
}
