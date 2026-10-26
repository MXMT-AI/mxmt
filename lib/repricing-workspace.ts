import {
  REPRICING_DEFAULTS,
  type RepricingParameters,
  type RepricingFilters,
  type RepricingRequest,
} from "./repricing-contract";
export type RepricingDraft = {
  parameters: RepricingParameters;
  filters: RepricingFilters;
};
export type RepricingEdits = Pick<
  RepricingRequest,
  "selection" | "manualPrices"
>;
const filterKeys = [
  "brandId",
  "categoryId",
  "skuId",
  "currency",
  "priceMin",
  "priceMax",
  "stockMin",
  "stockMax",
  "soldMax",
] as const;
const parameterKeys = [
  "minDiscountPct",
  "maxDiscountPct",
  "sharePct",
  "goal",
  "durationDays",
  "costProtection",
  "liquidation",
  "liquidationReason",
] as const;
/** Restore shareable controls without duplicating the server's pricing or validation formulas. */
export function readRepricingDraft(query: URLSearchParams): RepricingDraft {
  const parameters: RepricingParameters = { ...REPRICING_DEFAULTS };
  for (const key of parameterKeys) {
    const value = query.get(key);
    if (value === null) continue;
    if (["goal", "liquidationReason"].includes(key))
      Object.assign(parameters, { [key]: value });
    else if (key === "costProtection" || key === "liquidation")
      Object.assign(parameters, {
        [key]: value === "true" ? true : value === "false" ? false : value,
      });
    else
      Object.assign(parameters, { [key]: value.trim() ? Number(value) : null });
  }
  const filters: RepricingFilters = {
    status: (query.get("status") ??
      query.get("classification") ??
      "DEAD") as RepricingFilters["status"],
    soldMonths: (query.has("soldMonths")
      ? Number(query.get("soldMonths"))
      : 3) as 1 | 3 | 7,
    currency: "UAH",
  };
  for (const key of filterKeys) {
    const value = query.get(key);
    if (value !== null) filters[key] = value;
  }
  return { parameters, filters };
}
/** Preserve global dates, channel and snapshot; omit defaults and reset table pagination. */
export function writeRepricingDraft(
  query: URLSearchParams,
  draft: RepricingDraft,
) {
  const next = new URLSearchParams(query);
  next.delete("classification");
  next.delete("page");
  for (const key of parameterKeys) {
    const value = draft.parameters[key];
    if (value === REPRICING_DEFAULTS[key] || value === null) next.delete(key);
    else next.set(key, String(value));
  }
  next.delete("status");
  if (draft.filters.status !== "DEAD") next.set("status", draft.filters.status);
  next.delete("soldMonths");
  if (draft.filters.soldMonths !== 3)
    next.set("soldMonths", String(draft.filters.soldMonths));
  for (const key of filterKeys) {
    next.delete(key);
    const value = draft.filters[key];
    if (value !== undefined && !(key === "currency" && value === "UAH"))
      next.set(key, value);
  }
  return next;
}
export const defaultRepricingFilters = (): RepricingFilters => ({
  status: "DEAD",
  soldMonths: 3,
  currency: "UAH",
});
export function activeRepricingFilters(filters: RepricingFilters) {
  return (
    Number(filters.status !== "DEAD") +
    Number(filters.soldMonths !== 3) +
    filterKeys.filter(
      (k) =>
        filters[k] !== undefined && !(k === "currency" && filters[k] === "UAH"),
    ).length
  );
}
export type RepricingWorkspaceState = {
  draft: RepricingDraft;
  edits: RepricingEdits;
  page: number;
};
export type RepricingWorkspaceAction =
  | { type: "draft"; draft: RepricingDraft }
  | { type: "selection"; skuId: string; included: boolean }
  | { type: "price"; skuId: string; price: string | null }
  | { type: "page"; page: number };
export const initialRepricingState = (
  draft: RepricingDraft,
): RepricingWorkspaceState => ({
  draft,
  edits: { selection: [], manualPrices: [] },
  page: 1,
});
/** A filter/parameter change resets both override kinds; paging preserves the selected scenario. */
export function repricingWorkspaceReducer(
  state: RepricingWorkspaceState,
  action: RepricingWorkspaceAction,
): RepricingWorkspaceState {
  if (action.type === "draft") return initialRepricingState(action.draft);
  if (action.type === "page") return { ...state, page: action.page };
  if (action.type === "selection")
    return {
      ...state,
      edits: {
        ...state.edits,
        selection: [
          ...state.edits.selection.filter((r) => r.skuId !== action.skuId),
          { skuId: action.skuId, included: action.included },
        ],
      },
    };
  return {
    ...state,
    edits: {
      ...state.edits,
      manualPrices: [
        ...state.edits.manualPrices.filter((r) => r.skuId !== action.skuId),
        ...(action.price === null
          ? []
          : [{ skuId: action.skuId, price: action.price }]),
      ],
    },
  };
}
/** Guard even transports that resolve after abort; cancellation alone is insufficient. */
export class LatestRepricingRequest {
  private controller: AbortController | null = null;
  start() {
    this.controller?.abort();
    const current = new AbortController();
    this.controller = current;
    return {
      signal: current.signal,
      isCurrent: () => this.controller === current && !current.signal.aborted,
      cancel: () => current.abort(),
    };
  }
  schedule<T>(
    load: (signal: AbortSignal) => Promise<T>,
    commit: (data: T) => void,
    fail: (error: unknown) => void,
  ) {
    const current = this.start();
    const timer = setTimeout(() => {
      if (!current.isCurrent()) return;
      load(current.signal)
        .then((data) => {
          if (current.isCurrent()) commit(data);
        })
        .catch((error) => {
          if (current.isCurrent()) fail(error);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      current.cancel();
    };
  }
  cancel() {
    this.controller?.abort();
  }
}
