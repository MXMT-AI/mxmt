"use client";
import { useReorderingEditor } from "../use-reordering-editor";
import { useScenarioPreview } from "@/components/merchandising/use-scenario-preview";
import { reorderingRequest } from "@/lib/reordering-workspace";
import { reorderingCopy } from "@/lib/reordering-copy";
import type { getReorderingPreview } from "@/lib/reordering-store";
import type { Lang } from "@/lib/translations";
import Controls from "../reordering-controls/reordering-controls";
import { useScenarioExportPermission } from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useScenarioExport } from "@/components/merchandising/use-scenario-export";
import ScenarioExportPanel from "@/components/merchandising/scenario-export-panel/scenario-export-panel";
import { ScenarioPreviewError } from "@/components/merchandising/scenario-preview-error/scenario-preview-error";
import { ScenarioPreviewStatus } from "@/components/merchandising/scenario-preview-status/scenario-preview-status";
import { ScenarioSnapshotNote } from "@/components/merchandising/scenario-snapshot-note/scenario-snapshot-note";
import Table from "../reordering-table/reordering-table";
import Summary from "../reordering-summary/reordering-summary";
import { ReorderingSupplierGroups } from "../reordering-supplier-groups/reordering-supplier-groups";
export type ReorderingPreview = Awaited<
  ReturnType<typeof getReorderingPreview>
>;
export default function ReorderingEditor({
  snapshotId,
  monobrand = false,
  asOf,
  lang,
  onRefresh,
}: {
  snapshotId: string;
  monobrand?: boolean;
  asOf: string;
  lang: Lang;
  onRefresh: () => void;
}) {
  const { state, draft, change, reset, changePage, changeTransit, restoreTransit } = useReorderingEditor(monobrand);
  const copy = reorderingCopy[lang];
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const needsBrand =
    !monobrand && state.draft.mode === "brand" && !state.draft.filters.brandId;
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
    : reorderingRequest(snapshotId, {
        ...state,
        draft,
      });
  const preview = useScenarioPreview<ReorderingPreview>(
    "/api/merchandising/reordering/preview",
    request,
    JSON.stringify([snapshotId, needsBrand ? "brand-options" : state.draft]),
    "snapshotId",
  );
  const allowed = useScenarioExportPermission(),
    exportState = useScenarioExport("reorder");
  const current = preview.current && !needsBrand,
    error = preview.error;
  const ready = current && !error;
  return (
    <div className="space-y-5">
      <Controls
        monobrand={monobrand}
        draft={draft}
        data={preview.data}
        error={error}
        copy={copy}
        onChange={change}
        onReset={reset}
      />
      <ScenarioSnapshotNote asOf={asOf} locale={locale} copy={copy} />
      <ScenarioPreviewStatus
        prerequisite={needsBrand ? copy.chooseBrand : undefined}
        busy={!error && preview.busy}
        ready={ready}
        copy={copy}
      />
      {error ? (
        <ScenarioPreviewError
          message={error.code === "INVALID_REORDERING_REQUEST"
              ? copy.invalid
              : error.code === "REORDERING_OVERRIDE_INELIGIBLE"
                ? copy.filterError
                : copy.error}
          copy={copy}
          onRetry={preview.retry}
          onRefresh={onRefresh}
        />
      ) : null}
      {!needsBrand && preview.data && preview.sameControls ? (
        <Table
          monobrand={monobrand}
          data={preview.data}
          copy={copy}
          locale={locale}
          current={ready}
          error={error}
          transit={state.transit}
          onTransit={changeTransit}
          onRestore={restoreTransit}
          onPage={changePage}
        />
      ) : null}
      <Summary
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
      {ready && preview.data ? (
        <ReorderingSupplierGroups
          key={preview.data.previewId}
          data={preview.data}
          copy={copy}
          locale={locale}
          exporting={exportState.busy}
          onExport={
            allowed
              ? (supplierId, currency) =>
                  void exportState.prepare(preview.data!.previewId, request, {
                    supplierId,
                    currency,
                  })
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
