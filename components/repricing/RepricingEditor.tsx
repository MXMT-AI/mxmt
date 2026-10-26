"use client";
import { useEffect, useReducer, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  initialRepricingState,
  readRepricingDraft,
  writeRepricingDraft,
  repricingWorkspaceReducer,
  type RepricingDraft,
} from "@/lib/repricing-workspace";
import { repricingCopy } from "@/lib/repricing-copy";
import type { Lang } from "@/lib/translations";
import { button, Note } from "@/components/merchandising/ReportPrimitives";
import { useRepricingInputs, useRepricingPreview } from "./useRepricingPreview";
import RepricingControls from "./RepricingControls";
import RepricingTable from "./RepricingTable";
import RepricingSummary from "./RepricingSummary";
import { useScenarioExportPermission } from "@/components/merchandising/MerchandisingShell";
import { useScenarioExport } from "@/components/merchandising/useScenarioExport";
import ScenarioExportPanel from "@/components/merchandising/ScenarioExportPanel";
/** Controls own draft intent; the server owns eligibility, ranking, prices and totals. */
export default function RepricingEditor({
  snapshotId,
  lang,
  onRefresh,
}: {
  snapshotId: string;
  lang: Lang;
  onRefresh: () => void;
}) {
  const params = useSearchParams(),
    query = params.toString(),
    copy = repricingCopy[lang],
    locale = lang === "uk" ? "uk-UA" : "en-US";
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
  // Back/forward or a deep link resets edits; local native history changes already applied atomically.
  useEffect(() => {
    if (query !== lastUrl.current) {
      lastUrl.current = query;
      dispatch({
        type: "draft",
        draft: readRepricingDraft(new URLSearchParams(query)),
      });
      const page = new URLSearchParams(query).get("page");
      if (page) dispatch({ type: "page", page: Number(page) });
    }
  }, [query]);
  const inputs = useRepricingInputs(snapshotId),
    context = useRef<string | undefined>(undefined);
  const request = {
    inputSetId: inputs.data?.inputSetId ?? null,
    ...state.draft,
    ...state.edits,
    ...(state.edits.selection.length || state.edits.manualPrices.length
      ? { editContext: context.current }
      : {}),
    page: state.page,
    pageSize: 25,
  };
  const preview = useRepricingPreview(request);
  const allowed = useScenarioExportPermission(),
    exportState = useScenarioExport("reprice");
  useEffect(() => {
    if (preview.current && preview.data)
      context.current = preview.data.editContext;
  }, [preview.current, preview.data]);
  function change(draft: RepricingDraft) {
    dispatch({ type: "draft", draft });
    const next = writeRepricingDraft(
      new URLSearchParams(window.location.search),
      draft,
    );
    lastUrl.current = next.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${next}`,
    );
  }
  const error = inputs.error ?? preview.error;
  return (
    <div className="space-y-5">
      <RepricingControls
        draft={state.draft}
        onChange={change}
        data={preview.data}
        error={error}
        copy={copy}
      />
      <div
        role="status"
        aria-live="polite"
        className="text-sm text-[var(--muted)]"
      >
        {!inputs.data
          ? copy.loading
          : preview.busy
            ? copy.updating
            : preview.current
              ? copy.ready
              : ""}
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-[var(--border)] p-4 space-y-3"
        >
          <p>
            {error.code === "REPRICING_SOURCE_CHANGED" ||
            error.code === "SCREEN_SELECTION_MISMATCH"
              ? copy.sourceChanged
              : error.code === "STALE_REPRICING_EDITS"
                ? copy.staleEdits
                : error.code === "INVALID_REPRICING_REQUEST" ||
                    error.code === "INVALID_MANUAL_REPRICING_PRICE"
                  ? copy.invalid
                  : copy.error}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              type="button"
              onClick={inputs.error ? inputs.retry : preview.retry}
            >
              {copy.retry}
            </button>
            <button className={button} type="button" onClick={onRefresh}>
              {copy.refresh}
            </button>
          </div>
        </div>
      ) : null}
      {inputs.data ? (
        <Note>
          {copy.allChannels} · {copy.asOf}:{" "}
          {new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
            new Date(inputs.data.context.asOf + "T00:00:00Z"),
          )}
        </Note>
      ) : null}
      {inputs.data?.historyUnavailableReason ? (
        <p className="text-sm" role="status">
          {copy.history}
        </p>
      ) : null}
      {preview.data ? (
        <RepricingTable
          data={preview.data}
          edits={state.edits}
          copy={copy}
          locale={locale}
          canEdit={preview.sameControls && !inputs.error}
          settled={preview.current}
          error={preview.error}
          onSelection={(skuId, included) =>
            dispatch({ type: "selection", skuId, included })
          }
          onPrice={(skuId, price) => dispatch({ type: "price", skuId, price })}
          onPage={(page) => {
            dispatch({ type: "page", page });
            const next = new URLSearchParams(window.location.search);
            next.set("page", String(page));
            lastUrl.current = next.toString();
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}?${next}`,
            );
          }}
        />
      ) : null}
      {preview.current && preview.data?.counts.blockedSelectedSkuCount ? (
        <p role="alert" className="text-sm">
          {copy.blockedNote}
        </p>
      ) : null}
      <RepricingSummary
        data={preview.data}
        current={preview.current && !error}
        copy={copy}
        locale={locale}
        exporting={exportState.busy}
        onExport={
          allowed && preview.current && !error && preview.data?.canExport
            ? () => void exportState.prepare(preview.data!.previewId, request)
            : undefined
        }
      />
      <ScenarioExportPanel
        state={exportState}
        previewId={preview.data?.previewId}
        allowed={allowed}
        lang={lang}
      />
    </div>
  );
}
