import { parseDataTableQuery, type DataColumnMetadata } from "./data-table-api";
import { SKU_STATUSES, type SkuStatus } from "./classify";
import { ScreenApiError } from "./merchandising-snapshot";
export const SCREEN_NAMES = [
  "overview",
  "sales",
  "stock",
  "repricing",
  "reordering",
] as const;
export type ScreenName = (typeof SCREEN_NAMES)[number];
export const NULL_GROUP = "__unassigned__";
export type ScreenGroup = "sku" | "brand" | "category" | "channel";
export interface ScreenQuery {
  snapshotId: string;
  groupBy: ScreenGroup;
  domain: "sales" | "stock";
  page: number;
  pageSize: number;
  search: string | null;
  sort: string;
  direction: "asc" | "desc";
  brandId?: string;
  categoryId?: string;
  skuId?: string;
  channelId?: string;
  currency?: string;
  classification?: SkuStatus;
  ownership?: "OWN" | "CONSIGNMENT" | "UNKNOWN";
  supplierId?: string;
  mode: "shortage" | "brand" | "all";
  measure?: "money" | "units";
  metric?: "revenue" | "coveredGrossProfit" | "gmPct";
  others?: boolean;
  channelPage?: number;
  categoryPage?: number;
  brandPage?: number;
  categorySort?: "name" | "stockCost" | "DEAD" | "RISK" | "HEALTHY" | "OTHER";
  categoryDirection?: "asc" | "desc";
}
export const SALES_SCREEN_SORTS = [
  "name",
  "currency",
  "revenue",
  "units",
  "orderCount",
  "coveredGrossProfit",
  "gmPct",
  "lyRevenue",
  "revenueDelta",
] as const;
export const STOCK_SCREEN_SORTS = [
  "name",
  "currency",
  "quantity",
  "stockCost",
  "stockRetail",
  "weeksOnHand",
  "velocityPerWeek",
  "daysToZero",
  "sellThroughRatio",
  "skuCount",
] as const;
export function parseScreenQuery(
  params: URLSearchParams,
  screen: ScreenName,
): ScreenQuery {
  const allowed = new Set([
    "snapshotId",
    "groupBy",
    "domain",
    "page",
    "pageSize",
    "search",
    "sort",
    "direction",
    "brandId",
    "categoryId",
    "skuId",
    "channelId",
    "currency",
    "classification",
    "ownership",
    "supplierId",
    "mode",
    "measure",
    "metric",
    "others",
    "channelPage",
    "categoryPage",
    "brandPage",
    "categorySort",
    "categoryDirection",
  ]);
  for (const [key] of params)
    if (!allowed.has(key) || params.getAll(key).length !== 1)
      throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
  const id = params.get("snapshotId");
  if (!id || id.length > 200)
    throw new ScreenApiError("SCREEN_SNAPSHOT_ID_REQUIRED", 400);
  const domain =
    params.get("domain") ?? (screen === "sales" ? "sales" : "stock");
  const groupBy = params.get("groupBy") ?? "sku";
  const sort = params.get("sort") ?? "name",
    direction = params.get("direction") ?? "asc";
  const size = Number(params.get("pageSize") ?? 25),
    page = Number(params.get("page") ?? 1);
  if (
    !["sales", "stock"].includes(domain) ||
    (screen === "sales" && domain !== "sales") ||
    (["stock", "repricing", "reordering"].includes(screen) &&
      domain !== "stock") ||
    !["sku", "brand", "category", "channel"].includes(groupBy) ||
    (domain === "stock" && groupBy === "channel") ||
    !(domain === "sales" ? SALES_SCREEN_SORTS : STOCK_SCREEN_SORTS).includes(
      sort as never,
    ) ||
    !["asc", "desc"].includes(direction) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 200 ||
    (params.get("search")?.length ?? 0) > 200
  )
    throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
  const classification = params.get("classification"),
    ownership = params.get("ownership"),
    mode = params.get("mode") ?? "shortage";
  if (
    (classification !== null &&
      !SKU_STATUSES.includes(classification as SkuStatus)) ||
    (ownership !== null &&
      !["OWN", "CONSIGNMENT", "UNKNOWN"].includes(ownership)) ||
    !["shortage", "brand", "all"].includes(mode)
  )
    throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
  const filters: Partial<ScreenQuery> = {};
  for (const key of [
    "brandId",
    "categoryId",
    "skuId",
    "channelId",
    "supplierId",
    "currency",
  ] as const) {
    const v = params.get(key);
    if (v !== null) {
      if (
        !v ||
        v.length > 200 ||
        (key === "currency" && v !== NULL_GROUP && !/^[A-Z]{3}$/.test(v))
      )
        throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
      filters[key] = v;
    }
  }
  if (params.has("mode") && screen !== "reordering")
    throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
  if (screen === "reordering" && mode === "brand" && !filters.brandId)
    throw new ScreenApiError("BRAND_REQUIRED", 400);
  if (
    domain === "sales" &&
    (classification !== null ||
      ownership !== null ||
      filters.supplierId ||
      params.has("mode"))
  )
    throw new ScreenApiError("STOCK_FILTER_ON_SALES_VIEW", 400);
  const measure = params.get("measure") ?? "money";
  const metric = params.get("metric") ?? "revenue";
  const others = params.get("others");
  const channelPage = Number(params.get("channelPage") ?? 1);
  if (
    (screen !== "sales" &&
      ["measure", "metric", "others", "channelPage"].some((key) =>
        params.has(key),
      )) ||
    !["money", "units"].includes(measure) ||
    !["revenue", "coveredGrossProfit", "gmPct"].includes(metric) ||
    (others !== null && others !== "1") ||
    !Number.isSafeInteger(channelPage) ||
    channelPage < 1 ||
    channelPage > 100000
  )
    throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
  const categoryPage = Number(params.get("categoryPage") ?? 1),
    brandPage = Number(params.get("brandPage") ?? 1),
    categorySort = params.get("categorySort"),
    categoryDirection = params.get("categoryDirection") ?? "desc";
  if (
    (screen !== "stock" &&
      ["categoryPage", "brandPage", "categorySort", "categoryDirection"].some(
        (key) => params.has(key),
      )) ||
    ![categoryPage, brandPage].every(
      (p) => Number.isSafeInteger(p) && p >= 1 && p <= 100000,
    ) ||
    (categorySort !== null &&
      !["name", "stockCost", "DEAD", "RISK", "HEALTHY", "OTHER"].includes(
        categorySort,
      )) ||
    !["asc", "desc"].includes(categoryDirection)
  )
    throw new ScreenApiError("INVALID_SCREEN_QUERY", 400);
  const table = parseDataTableQuery(params, {
    pageSizeMin: 1,
    pageSizeDefault: 25,
  });
  return {
    snapshotId: id,
    ...(screen === "stock"
      ? {
          categoryPage,
          brandPage,
          ...(categorySort
            ? { categorySort: categorySort as ScreenQuery["categorySort"] }
            : {}),
          categoryDirection: categoryDirection as "asc" | "desc",
        }
      : {}),
    ...(screen === "sales"
      ? {
          measure: measure as ScreenQuery["measure"],
          metric: metric as ScreenQuery["metric"],
          others: others === "1",
          channelPage,
        }
      : {}),
    domain: domain as ScreenQuery["domain"],
    groupBy: groupBy as ScreenGroup,
    page: table.page,
    pageSize: table.pageSize,
    search: table.search,
    sort,
    direction: direction as ScreenQuery["direction"],
    ...filters,
    ...(classification ? { classification: classification as SkuStatus } : {}),
    ...(ownership ? { ownership: ownership as ScreenQuery["ownership"] } : {}),
    mode: mode as ScreenQuery["mode"],
  };
}
export interface ScreenColumn extends DataColumnMetadata {
  nullable: boolean;
  unit: string;
  encoding: "STRING" | "INTEGER" | "DECIMAL_STRING" | "BOOLEAN" | "JSON";
  nullReason?: string;
}
export const STOCK_SCREEN_COLUMNS: DataColumnMetadata[] = [
  { key: "sku", label: "SKU", type: "text" },
  { key: "barcode", label: "Barcode", type: "text" },
  { key: "ownership", label: "Ownership", type: "text" },
  { key: "unitCost", label: "Unit cost", type: "money" },
  { key: "retailPrice", label: "Current price", type: "money" },
  { key: "inTransitQuantity", label: "Verified in transit", type: "quantity" },
  { key: "sourceObservedAt", label: "Stock observed at", type: "date" },
  { key: "name", label: "Name", type: "text" },
  { key: "currency", label: "Currency", type: "text" },
  { key: "skuCount", label: "SKU count", type: "number" },
  { key: "quantity", label: "Stock units", type: "quantity" },
  { key: "stockCost", label: "Stock at cost", type: "money" },
  { key: "stockRetail", label: "Stock at retail", type: "money" },
  { key: "velocityPerWeek", label: "Weekly velocity", type: "quantity" },
  { key: "weeksOnHand", label: "Weeks on hand", type: "number" },
  { key: "daysToZero", label: "Days to zero", type: "number" },
  { key: "sellThroughRatio", label: "Sell-through", type: "percentage" },
  { key: "classification", label: "SKU status", type: "text" },
  { key: "eligibility", label: "Action eligibility", type: "text" },
];
export function screenColumns(columns: DataColumnMetadata[]): ScreenColumn[] {
  return columns.map((c) => ({
    ...c,
    nullable: ![
      "name",
      "skuCount",
      "orderCount",
      "returnOrderCount",
      "missingProfitCount",
      "units",
      "coverage",
    ].includes(c.key),
    unit:
      c.key === "velocityPerWeek"
        ? "UNITS_PER_WEEK"
        : c.type === "money"
          ? "ROW_CURRENCY"
          : c.type === "percentage"
            ? "RATIO_1_EQUALS_100_PERCENT"
            : c.type === "quantity"
              ? "UNITS"
              : c.key === "weeksOnHand"
                ? "WEEKS"
                : c.key === "daysToZero"
                  ? "DAYS"
                  : "NONE",
    encoding:
      ["money", "quantity", "percentage"].includes(c.type) ||
      ["weeksOnHand", "daysToZero"].includes(c.key)
        ? "DECIMAL_STRING"
        : c.type === "number"
          ? "INTEGER"
          : "STRING",
    nullReason: "UNAVAILABLE_OR_INCOMPLETE_SOURCE_COVERAGE",
  }));
}
export function screenDrillDown(
  screen: ScreenName,
  q: ScreenQuery,
  id: string | null,
  currency: string | null,
) {
  const p = new URLSearchParams({
    snapshotId: q.snapshotId,
    domain: q.domain,
    groupBy: "sku",
  });
  for (const key of [
    "brandId",
    "categoryId",
    "skuId",
    "channelId",
    "supplierId",
    "classification",
    "ownership",
    "search",
  ] as const) {
    const v = q[key];
    if (v) p.set(key, v);
  }
  p.set("currency", currency ?? NULL_GROUP);
  p.set(`${q.groupBy}Id`, id ?? NULL_GROUP);
  if (screen === "reordering") p.set("mode", q.mode);
  return `/api/merchandising/${screen}?${p}`;
}
