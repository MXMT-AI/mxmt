"use client";
import { useEffect, useRef } from "react";
import { useRepricingEditor } from "../use-repricing-editor";
import { repricingCopy } from "@/lib/repricing-copy";
import type { Lang } from "@/lib/translations";
import { Button } from "@/components/ui/button/button";
import { AlertPanel } from "@/components/ui/alert-panel/alert-panel";
import { Note } from "@/components/ui/note/note";
import { useRepricingInputs, useRepricingPreview } from "../use-repricing-preview";
import RepricingControls from "../repricing-controls/repricing-controls";
import RepricingTable from "../repricing-table/repricing-table";
import RepricingSummary from "../repricing-summary/repricing-summary";
import { useScenarioExportPermission } from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useScenarioExport } from "@/components/merchandising/use-scenario-export";
import ScenarioExportPanel from "@/components/merchandising/scenario-export-panel/scenario-export-panel";
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
      <div
        role="status"
        aria-live="polite"
        className="text-sm text-(--muted)"
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
        <AlertPanel
          className="bg-transparent p-4"
          message={error.code === "REPRICING_SOURCE_CHANGED" ||
            error.code === "SCREEN_SELECTION_MISMATCH"
              ? copy.sourceChanged
              : error.code === "STALE_REPRICING_EDITS"
                ? copy.staleEdits
                : error.code === "INVALID_REPRICING_REQUEST" ||
                    error.code === "INVALID_MANUAL_REPRICING_PRICE"
                  ? copy.invalid
                  : copy.error}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="report"
              onClick={inputs.error ? inputs.retry : preview.retry}
            >
              {copy.retry}
            </Button>
            <Button variant="report" onClick={onRefresh}>
              {copy.refresh}
            </Button>
          </div>
        </AlertPanel>
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
