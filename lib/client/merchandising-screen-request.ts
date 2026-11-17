import type { MerchandisingFilters, MvpScreen } from "@/lib/merchandising-navigation";

const filterKeys = ["brandId", "categoryId", "skuId", "currency", "channelId"] as const;
const selectionFilterKeys: Record<MvpScreen, readonly string[]> = {
  overview: filterKeys,
  sales: filterKeys,
  stock: filterKeys,
  repricing: [],
  reordering: [],
};
const screenControlKeys: Record<MvpScreen, readonly string[]> = {
  overview: [],
  sales: ["groupBy", "measure", "metric", "others", "page", "channelPage"],
  stock: ["groupBy", "classification", "ownership", "supplierId", "page", "sort", "direction", "categoryPage", "brandPage", "categorySort", "categoryDirection"],
  repricing: [],
  reordering: [],
};

export function readScreenControls(
  screen: MvpScreen,
  params: Pick<URLSearchParams, "get">,
  { includeEmpty = false }: { includeEmpty?: boolean } = {},
): Record<string, string> {
  const controls: Record<string, string> = {};
  for (const key of screenControlKeys[screen]) {
    const value = params.get(key);
    if (value !== null && (includeEmpty || value !== "")) controls[key] = value;
  }
  return controls;
}

export function buildScreenSelection(
  filters: MerchandisingFilters,
  screen: MvpScreen,
  params: Pick<URLSearchParams, "get">,
  controls: Record<string, string>,
) {
  const selection = new URLSearchParams({ dateFrom: filters.dateFrom, dateTo: filters.dateTo });
  for (const key of ["asOf", ...selectionFilterKeys[screen]]) {
    const value = params.get(key);
    if (value) selection.set(key, value);
  }
  for (const [key, value] of Object.entries(controls)) selection.set(key, value);
  return selection;
}

export function buildScreenReadParams(screen: MvpScreen, source: URLSearchParams, snapshotId: string | null) {
  const params = new URLSearchParams({ snapshotId: snapshotId ?? "" });
  for (const key of [...filterKeys, ...screenControlKeys[screen]]) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  return params;
}
