"use client";
import { useEffect, useRef } from "react";
import { useRepricingEditor } from "../use-repricing-editor";
import { repricingCopy } from "@/lib/repricing-copy";
import type { Lang } from "@/lib/translations";
import { useRepricingInputs, useRepricingPreview } from "../use-repricing-preview";
import RepricingControls from "../repricing-controls/repricing-controls";
import RepricingTable from "../repricing-table/repricing-table";
import RepricingSummary from "../repricing-summary/repricing-summary";
import { useScenarioExportPermission } from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useScenarioExport } from "@/components/merchandising/use-scenario-export";
import ScenarioExportPanel from "@/components/merchandising/scenario-export-panel/scenario-export-panel";
import { ScenarioPreviewError } from "@/components/merchandising/scenario-preview-error/scenario-preview-error";
import { ScenarioPreviewStatus } from "@/components/merchandising/scenario-preview-status/scenario-preview-status";
import { ScenarioSnapshotNote } from "@/components/merchandising/scenario-snapshot-note/scenario-snapshot-note";
export default function RepricingEditor({
  snapshotId,
  monobrand = false,
  lang,
  onRefresh,
}: {
  snapshotId: string;
  monobrand?: boolean;
  lang: Lang;
  onRefresh: () => void;
}) {
  const { state, draft, change, changePage, changeSelection, changePrice } = useRepricingEditor(monobrand);
  const copy = repricingCopy[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const inputs = useRepricingInputs(snapshotId),
    context = useRef<string | undefined>(undefined);
  const request = {
    inputSetId: inputs.data?.inputSetId ?? null,
    ...draft,
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
  const error = inputs.error ?? preview.error;
  const ready = preview.current && !error;
  return (
    <div className="space-y-5">
      <RepricingControls
        monobrand={monobrand}
        draft={draft}
        onChange={change}
        data={preview.data}
        error={error}
        copy={copy}
      />
      <ScenarioPreviewStatus
        prerequisite={!error && !inputs.data ? copy.loading : undefined}
        busy={!error && preview.busy}
        ready={ready}
        copy={copy}
      />
      {error ? (
        <ScenarioPreviewError
          message={error.code === "REPRICING_SOURCE_CHANGED" ||
            error.code === "SCREEN_SELECTION_MISMATCH"
              ? copy.sourceChanged
              : error.code === "STALE_REPRICING_EDITS"
                ? copy.staleEdits
                : error.code === "INVALID_REPRICING_REQUEST" ||
                    error.code === "INVALID_MANUAL_REPRICING_PRICE"
                  ? copy.invalid
                  : copy.error}
          copy={copy}
          onRetry={inputs.error ? inputs.retry : preview.retry}
          onRefresh={onRefresh}
        />
      ) : null}
      {inputs.data ? (
        <ScenarioSnapshotNote asOf={inputs.data.context.asOf} locale={locale} copy={copy} />
      ) : null}
      {inputs.data?.historyUnavailableReason ? (
        <p className="text-sm" role="status">
          {copy.history}
        </p>
      ) : null}
      {preview.data ? (
        <RepricingTable
          monobrand={monobrand}
          data={preview.data}
          edits={state.edits}
          copy={copy}
          locale={locale}
          canEdit={preview.sameControls && !inputs.error}
          settled={preview.current}
          error={preview.error}
          onSelection={changeSelection}
          onPrice={changePrice}
          onPage={changePage}
        />
      ) : null}
      {preview.current && preview.data?.counts.blockedSelectedSkuCount ? (
        <p role="alert" className="text-sm">
          {copy.blockedNote}
        </p>
      ) : null}
      <RepricingSummary
        data={preview.data}
        current={ready}
        copy={copy}
        locale={locale}
        exporting={exportState.busy}
        onExport={
          allowed && ready && preview.data?.canExport
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
