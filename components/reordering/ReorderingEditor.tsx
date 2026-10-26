"use client";
import { useEffect, useReducer, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useScenarioPreview } from "@/components/merchandising/useScenarioPreview";
import { button, Note } from "@/components/merchandising/ReportPrimitives";
import {
  initialReorderingState,
  reorderingReducer,
  reorderingRequest,
  writeReorderingDraft,
  type ReorderingDraft,
} from "@/lib/reordering-workspace";
import { reorderingCopy } from "@/lib/reordering-copy";
import type { getReorderingPreview } from "@/lib/reordering-store";
import type { Lang } from "@/lib/translations";
import Controls from "./ReorderingControls";
import Table from "./ReorderingTable";
import Summary, { SupplierGroups } from "./ReorderingSummary";
export type ReorderingPreview = Awaited<
  ReturnType<typeof getReorderingPreview>
>;
/** Preserve scenario intent and confirmations; every recommendation comes from the server. */
export default function ReorderingEditor({
  snapshotId,
  asOf,
  lang,
  onRefresh,
}: {
  snapshotId: string;
  asOf: string;
  lang: Lang;
  onRefresh: () => void;
}) {
  const params = useSearchParams(),
    query = params.toString(),
    lastUrl = useRef(query),
    copy = reorderingCopy[lang],
    locale = lang === "uk" ? "uk-UA" : "en-US";
  const [state, dispatch] = useReducer(reorderingReducer, query, (q) =>
    initialReorderingState(new URLSearchParams(q)),
  );
  useEffect(() => {
    if (query !== lastUrl.current) {
      lastUrl.current = query;
      dispatch({ type: "restore", query });
    }
  }, [query]);
  const needsBrand =
    state.draft.mode === "brand" && !state.draft.filters.brandId;
  const request = needsBrand
    ? {
        snapshotId,
        mode: "shortage",
        filters: {},
        parameters: {},
        overrides: [],
        page: 1,
        pageSize: 25,
      }
    : reorderingRequest(snapshotId, state);
  const preview = useScenarioPreview<ReorderingPreview>(
    "/api/merchandising/reordering/preview",
    request,
    JSON.stringify([snapshotId, needsBrand ? "brand-options" : state.draft]),
    "snapshotId",
  );
  const current = preview.current && !needsBrand,
    error = preview.error;
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
  return (
    <div className="space-y-5">
      <Controls
        draft={state.draft}
        data={preview.data}
        error={error}
        copy={copy}
        onChange={change}
        onReset={reset}
      />
      <Note>
        {copy.allChannels} · {copy.asOf}:{" "}
        {new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
          new Date(asOf + "T00:00:00Z"),
        )}
      </Note>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-[var(--muted)]"
      >
        {needsBrand
          ? copy.chooseBrand
          : preview.busy
            ? copy.updating
            : current
              ? copy.ready
              : ""}
      </p>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-[var(--border)] p-4 space-y-3"
        >
          <p>
            {error.code === "INVALID_REORDERING_REQUEST"
              ? copy.invalid
              : error.code === "REORDERING_OVERRIDE_INELIGIBLE"
                ? copy.filterError
                : copy.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={preview.retry}>
              {copy.retry}
            </button>
            <button type="button" className={button} onClick={onRefresh}>
              {copy.refresh}
            </button>
          </div>
        </div>
      ) : null}
      {!needsBrand && preview.data && preview.sameControls ? (
        <Table
          data={preview.data}
          copy={copy}
          locale={locale}
          current={current && !error}
          error={error}
          transit={state.transit}
          onTransit={(skuId, value) =>
            dispatch({ type: "transit", skuId, value })
          }
          onPage={(page) => {
            dispatch({ type: "page", page });
            const next = new URLSearchParams(window.location.search);
            next.set("page", String(page));
            save(next);
          }}
        />
      ) : null}
      <Summary
        data={preview.data}
        current={current && !error}
        copy={copy}
        locale={locale}
      />
      {current && !error && preview.data ? (
        <SupplierGroups
          key={preview.data.previewId}
          data={preview.data}
          copy={copy}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
