"use client";

import { useEffect, useReducer, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { profileReordering } from "@/lib/merchandising-profile";
import {
  initialReorderingState,
  reorderingReducer,
  writeReorderingDraft,
  type ReorderingDraft,
} from "@/lib/reordering-workspace";

export function useReorderingEditor(monobrand: boolean) {
  const query = useSearchParams().toString();
  const lastUrl = useRef(query);
  const [state, dispatch] = useReducer(reorderingReducer, query, (q) =>
    initialReorderingState(new URLSearchParams(q)),
  );
  useEffect(() => {
    if (query !== lastUrl.current) {
      const previous = initialReorderingState(new URLSearchParams(lastUrl.current));
      const next = initialReorderingState(new URLSearchParams(query));
      lastUrl.current = query;
      if (JSON.stringify(previous.draft) === JSON.stringify(next.draft))
        dispatch({ type: "page", page: next.page });
      else dispatch({ type: "restore", query });
    }
  }, [query]);

  function save(next: URLSearchParams) {
    lastUrl.current = next.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${next}`,
    );
  }
  function change(draft: ReorderingDraft) {
    dispatch({ type: "draft", draft });
    save(
      writeReorderingDraft(new URLSearchParams(window.location.search), draft),
    );
  }
  function reset() {
    const draft: ReorderingDraft = {
        mode: "shortage",
        filters: {},
        leadDays: "",
        coverDays: "",
      },
      next = writeReorderingDraft(
        new URLSearchParams(window.location.search),
        draft,
      );
    dispatch({ type: "restore", query: next.toString() });
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
    draft: profileReordering(state.draft, monobrand),
    change,
    reset,
    changePage,
    changeTransit: (skuId: string, value: string) => dispatch({ type: "transit", skuId, value }),
    restoreTransit: (skuId: string) => dispatch({ type: "restoreTransit", skuId }),
  };
}
