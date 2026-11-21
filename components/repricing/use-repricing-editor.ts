"use client";

import { useEffect, useReducer, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { profileFilters } from "@/lib/merchandising-profile";
import {
  initialRepricingState,
  readRepricingDraft,
  writeRepricingDraft,
  repricingWorkspaceReducer,
  type RepricingDraft,
} from "@/lib/repricing-workspace";

export function useRepricingEditor(monobrand: boolean) {
  const query = useSearchParams().toString();
  const [state, dispatch] = useReducer(
    repricingWorkspaceReducer,
    query,
    (q) => ({
      ...initialRepricingState(readRepricingDraft(new URLSearchParams(q))),
      page: new URLSearchParams(q).has("page")
        ? Number(new URLSearchParams(q).get("page"))
        : 1,
    }),
  );
  const lastUrl = useRef(query);
  useEffect(() => {
    if (query !== lastUrl.current) {
      const previous = readRepricingDraft(new URLSearchParams(lastUrl.current));
      const params = new URLSearchParams(query);
      const next = readRepricingDraft(params);
      lastUrl.current = query;
      if (JSON.stringify(previous) !== JSON.stringify(next))
        dispatch({ type: "draft", draft: next });
      dispatch({ type: "page", page: Number(params.get("page") ?? 1) });
    }
  }, [query]);
  function save(next: URLSearchParams) {
    lastUrl.current = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
  }
  function change(draft: RepricingDraft) {
    dispatch({ type: "draft", draft });
    const next = writeRepricingDraft(
      new URLSearchParams(window.location.search),
      draft,
    );
    save(next);
  }
  function changePage(page: number) {
    dispatch({ type: "page", page });
    const next = new URLSearchParams(window.location.search);
    next.set("page", String(page));
    save(next);
  }

  return {
    state,
    draft: { ...state.draft, filters: profileFilters(state.draft.filters, monobrand) },
    change,
    changePage,
    changeSelection: (skuId: string, included: boolean) => dispatch({ type: "selection", skuId, included }),
    changePrice: (skuId: string, price: string | null) => dispatch({ type: "price", skuId, price }),
  };
}
