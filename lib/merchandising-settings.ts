export interface ClientMerchandisingSettings {
  schemaVersion: 1;
  profileMode: "MONOBRAND" | "MULTIBRAND";
  monoBrandId: string | null;
  monthlyPlans: Record<string, string>;
  planCurrency: string | null;
  minMarginPct: number;
  turnoverMonths: number;
  deadDays: 60 | 90 | 120;
  healthyWohWeeks: number;
  riskWohWeeks: number;
  newProductWeeks: number;
  saleStatuses: string[];
  saleStatusesVerified: boolean;
  excludedChannels: string[];
  excludedProjects: string[];
  projectField: string | null;
  leadDays: number;
  coverDays: number;
  moq: number;
}
export type SettingsResource =
  | "client"
  | "brand"
  | "sku"
  | "supplier"
  | "category";
export type Ownership = "UNKNOWN" | "OWN" | "CONSIGNMENT";
export class SettingsValidationError extends Error {
  constructor(public fields: Record<string, string>) {
    super("INVALID_SETTINGS");
  }
}
export function defaultClientSettings(): ClientMerchandisingSettings {
  return {
    schemaVersion: 1,
    profileMode: "MULTIBRAND",
    monoBrandId: null,
    monthlyPlans: {},
    planCurrency: null,
    minMarginPct: 45,
    turnoverMonths: 3,
    deadDays: 90,
    healthyWohWeeks: 12,
    riskWohWeeks: 26,
    newProductWeeks: 6,
    saleStatuses: ["5", "59", "60"],
    saleStatusesVerified: false,
    excludedChannels: [],
    excludedProjects: [],
    projectField: null,
    leadDays: 30,
    coverDays: 60,
    moq: 1,
  };
}
const record = (v: unknown): v is Record<string, unknown> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
export function validateClientSettings(
  value: unknown,
): ClientMerchandisingSettings {
  if (!record(value))
    throw new SettingsValidationError({ settings: "object_required" });
  const errors: Record<string, string> = {},
    defaults = defaultClientSettings();
  for (const key of Object.keys(value))
    if (!Object.hasOwn(defaults, key)) errors[key] = "unsupported_field";
  const number = (
    key: keyof ClientMerchandisingSettings,
    min: number,
    max: number,
    integer = false,
  ) => {
    const n = value[key];
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      n < min ||
      n > max ||
      (integer && !Number.isInteger(n))
    )
      errors[key] = `range:${min}:${max}`;
    return n as number;
  };
  const ids = (
    key: "saleStatuses" | "excludedChannels" | "excludedProjects",
  ) => {
    const v = value[key];
    if (
      !Array.isArray(v) ||
      v.length > 100 ||
      v.some((x) => typeof x !== "string" || !x.trim() || x.length > 200) ||
      new Set(v).size !== v.length
    ) {
      errors[key] = "invalid_ids";
      return [];
    }
    return v as string[];
  };
  const result: ClientMerchandisingSettings = {
    schemaVersion: 1,
    profileMode:
      value.profileMode as ClientMerchandisingSettings["profileMode"],
    monoBrandId: value.monoBrandId as string | null,
    monthlyPlans: {},
    planCurrency: value.planCurrency as string | null,
    minMarginPct: number("minMarginPct", 0, 100),
    turnoverMonths: number("turnoverMonths", 0.01, 120),
    deadDays: number("deadDays", 60, 120, true) as 60 | 90 | 120,
    healthyWohWeeks: number("healthyWohWeeks", 0.01, 520),
    riskWohWeeks: number("riskWohWeeks", 0.01, 520),
    newProductWeeks: number("newProductWeeks", 0, 52, true),
    saleStatuses: ids("saleStatuses"),
    saleStatusesVerified: value.saleStatusesVerified as boolean,
    excludedChannels: ids("excludedChannels"),
    excludedProjects: ids("excludedProjects"),
    projectField: value.projectField as string | null,
    leadDays: number("leadDays", 0, 3650, true),
    coverDays: number("coverDays", 0, 3650, true),
    moq: number("moq", 1, 1000000, true),
  };
  if (
    result.planCurrency !== null &&
    (typeof result.planCurrency !== "string" ||
      !/^[A-Z]{3}$/.test(result.planCurrency))
  )
    errors.planCurrency = "invalid_currency";
  if (value.schemaVersion !== 1) errors.schemaVersion = "unsupported_version";
  if (!["MONOBRAND", "MULTIBRAND"].includes(result.profileMode))
    errors.profileMode = "choose_mode";
  if (
    (result.monoBrandId !== null &&
      (typeof result.monoBrandId !== "string" ||
        !result.monoBrandId ||
        result.monoBrandId.length > 200)) ||
    (result.profileMode === "MONOBRAND" && !result.monoBrandId)
  )
    errors.monoBrandId = "choose_brand";
  if (![60, 90, 120].includes(result.deadDays))
    errors.deadDays = "choose_dead_days";
  if (result.riskWohWeeks <= result.healthyWohWeeks)
    errors.riskWohWeeks = "above_healthy";
  if (typeof result.saleStatusesVerified !== "boolean")
    errors.saleStatusesVerified = "boolean_required";
  if (
    result.saleStatuses.some((id) => !/^\d{1,20}$/.test(id)) ||
    (result.saleStatusesVerified && !result.saleStatuses.length)
  )
    errors.saleStatuses = "invalid_statuses";
  if (
    (result.projectField !== null &&
      (typeof result.projectField !== "string" ||
        !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(result.projectField))) ||
    (result.excludedProjects.length && !result.projectField)
  )
    errors.projectField = "project_field_required";
  if (
    !record(value.monthlyPlans) ||
    Object.keys(value.monthlyPlans).length > 120
  )
    errors.monthlyPlans = "invalid_plans";
  else
    for (const [month, amount] of Object.entries(value.monthlyPlans)) {
      if (
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
        typeof amount !== "string" ||
        !/^\d{1,14}(\.\d{1,2})?$/.test(amount)
      )
        errors.monthlyPlans = "invalid_plans";
      else result.monthlyPlans[month] = amount;
    }
  if (Object.keys(result.monthlyPlans).length && !result.planCurrency)
    errors.planCurrency = "currency_required";
  if (Object.keys(errors).length) throw new SettingsValidationError(errors);
  return result;
}
export function validateEntitySettings(
  resource: Exclude<SettingsResource, "client">,
  value: unknown,
): Record<string, unknown> {
  if (!record(value))
    throw new SettingsValidationError({ settings: "object_required" });
  const allowed =
    resource === "brand"
      ? ["ownership", "commissionPct", "supplierId"]
      : resource === "sku"
        ? ["ownershipOverride", "commissionPct", "supplierId"]
        : resource === "supplier"
          ? ["name", "leadDays", "coverDays", "moq"]
          : ["seasonMonths"];
  const errors: Record<string, string> = {};
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) errors[key] = "unsupported_field";
  const v = { ...value };
  if (resource === "brand" || resource === "sku") {
    const field = resource === "brand" ? "ownership" : "ownershipOverride",
      owner = v[field];
    if (
      !(resource === "sku" && owner === null) &&
      !["UNKNOWN", "OWN", "CONSIGNMENT"].includes(String(owner))
    )
      errors[field] = "invalid_ownership";
    if (
      v.commissionPct !== null &&
      (typeof v.commissionPct !== "number" ||
        !Number.isFinite(v.commissionPct) ||
        v.commissionPct < 0 ||
        v.commissionPct > 100 ||
        !/^\d+(\.\d{1,6})?$/.test(String(v.commissionPct)))
    )
      errors.commissionPct = "range:0:100";
    if (v.commissionPct !== null && owner !== null && owner !== "CONSIGNMENT")
      errors.commissionPct = "commission_requires_consignment";
    if (
      v.supplierId !== null &&
      (typeof v.supplierId !== "string" ||
        !v.supplierId ||
        v.supplierId.length > 200)
    )
      errors.supplierId = "choose_supplier";
  } else if (resource === "supplier") {
    if (
      typeof v.name !== "string" ||
      !v.name.trim() ||
      v.name.trim().length > 200
    )
      errors.name = "name_required";
    else v.name = v.name.trim();
    for (const [field, min, max] of [
      ["leadDays", 0, 3650],
      ["coverDays", 0, 3650],
      ["moq", 1, 1000000],
    ] as const)
      if (
        typeof v[field] !== "number" ||
        !Number.isInteger(v[field]) ||
        (v[field] as number) < min ||
        (v[field] as number) > max
      )
        errors[field] = `range:${min}:${max}`;
  } else {
    if (
      !Array.isArray(v.seasonMonths) ||
      !v.seasonMonths.length ||
      v.seasonMonths.length > 12 ||
      v.seasonMonths.some((m) => !Number.isInteger(m) || m < 1 || m > 12) ||
      new Set(v.seasonMonths).size !== v.seasonMonths.length
    )
      errors.seasonMonths = "invalid_months";
    else
      v.seasonMonths = [...v.seasonMonths].sort(
        (a, b) => (a as number) - (b as number),
      );
  }
  if (Object.keys(errors).length) throw new SettingsValidationError(errors);
  return v;
}
