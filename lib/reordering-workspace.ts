import type { ReorderingRequest } from "./reordering-contract";
export interface ReorderingDraft {
  mode: ReorderingRequest["mode"];
  filters: ReorderingRequest["filters"];
  leadDays: string;
  coverDays: string;
}
const filterKeys = [
  "brandId",
  "categoryId",
  "supplierId",
  "skuId",
  "currency",
] as const;
/** Keep global context and canonical drill-down IDs; absent numeric controls inherit supplier policy. */
export function readReorderingDraft(query: URLSearchParams): ReorderingDraft {
  const filters: ReorderingRequest["filters"] = {};
  for (const key of filterKeys) {
    const value = query.get(key);
    if (value !== null) filters[key] = value;
  }
  return {
    mode:
      query.get("mode") === "all"
        ? "all"
        : query.get("mode") === "brand"
          ? "brand"
          : "shortage",
    filters,
    leadDays: query.get("leadDays") ?? "",
    coverDays: query.get("coverDays") ?? "",
  };
}
/** Persist shareable controls while leaving scenario-only transit confirmations out of the URL. */
export function writeReorderingDraft(
  query: URLSearchParams,
  draft: ReorderingDraft,
) {
  const next = new URLSearchParams(query);
  next.delete("page");
  next.delete("mode");
  if (draft.mode !== "shortage") next.set("mode", draft.mode);
  for (const key of filterKeys) {
    next.delete(key);
    if (draft.filters[key] !== undefined) next.set(key, draft.filters[key]!);
  }
  for (const key of ["leadDays", "coverDays"] as const) {
    next.delete(key);
    if (draft[key] !== "") next.set(key, draft[key]);
  }
  return next;
}
export type ReorderingState = {
  draft: ReorderingDraft;
  transit: Record<string, string>;
  page: number;
};
/** Restore safe navigation defaults; financial scenario values still require server validation. */
export const initialReorderingState = (
  query: URLSearchParams,
): ReorderingState => ({
  draft: readReorderingDraft(query),
  transit: {},
  page: /^(?:[1-9]\d{0,4}|100000)$/.test(query.get("page") ?? "")
    ? Number(query.get("page"))
    : 1,
});
export type ReorderingAction =
  | { type: "draft"; draft: ReorderingDraft }
  | { type: "transit"; skuId: string; value: string }
  | { type: "restoreTransit"; skuId: string }
  | { type: "page"; page: number }
  | { type: "restore"; query: string };
/** Transit confirmations persist across terms, filters and paging within one pinned snapshot. */
export function reorderingReducer(
  state: ReorderingState,
  action: ReorderingAction,
): ReorderingState {
  if (action.type === "restore")
    return initialReorderingState(new URLSearchParams(action.query));
  if (action.type === "draft")
    return {
      ...state,
      draft: action.draft,
      page: 1,
      transit:
        JSON.stringify([state.draft.mode, state.draft.filters]) ===
        JSON.stringify([action.draft.mode, action.draft.filters])
          ? state.transit
          : {},
    };
  if (action.type === "page") return { ...state, page: action.page };
  const transit = { ...state.transit };
  if (action.type === "restoreTransit") delete transit[action.skuId];
  else transit[action.skuId] = action.value;
  return { ...state, transit };
}
/** Serialize intent only; malformed day values remain for server-side field validation. */
export function reorderingRequest(
  snapshotId: string,
  state: ReorderingState,
): ReorderingRequest {
  const parameters: Record<string, unknown> = {};
  for (const key of ["leadDays", "coverDays"] as const) {
    const value = state.draft[key];
    if (value !== "")
      parameters[key] = /^\d+$/.test(value) ? Number(value) : value;
  }
  return {
    snapshotId,
    mode: state.draft.mode,
    filters: state.draft.filters,
    parameters,
    overrides: Object.entries(state.transit)
      .filter(([, value]) => value !== "")
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([skuId, inTransitQuantity]) => ({ skuId, inTransitQuantity })),
    page: state.page,
    pageSize: 25,
  } as ReorderingRequest;
}
