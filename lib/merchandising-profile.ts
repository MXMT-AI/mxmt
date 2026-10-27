/** Monobrand screens skip brand navigation while retaining canonical brand facts for policy and CSV contracts. */
export function profileFilters<T extends { brandId?: string }>(
  filters: T,
  monobrand: boolean,
): T {
  if (!monobrand) return filters;
  const { brandId: _, ...rest } = filters;
  return rest as T;
}
/** A legacy brand-level action becomes an all-products action in a monobrand workspace. */
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
