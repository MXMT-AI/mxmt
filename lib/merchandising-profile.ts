export function profileFilters<T extends { brandId?: string }>(
  filters: T,
  monobrand: boolean,
): T {
  if (!monobrand) return filters;
  const { brandId: _, ...rest } = filters;
  return rest as T;
}
export function profileReordering<
  T extends {
    mode: "shortage" | "brand" | "all";
    filters: { brandId?: string };
  },
>(selection: T, monobrand: boolean): T {
  return monobrand
    ? {
        ...selection,
        mode: selection.mode === "brand" ? "all" : selection.mode,
        filters: profileFilters(selection.filters, true),
      }
    : selection;
}
