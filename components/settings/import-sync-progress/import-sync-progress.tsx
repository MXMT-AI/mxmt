import { Text } from "@/components/ui/text/text";
import type { Lang } from "@/lib/translations";
import type { Progress, ImportResponse } from "../sales-drive-import-card/import-types";
import { errorLabel, importStateLabels } from "../sales-drive-import-card/copy";
import { settingsImportSyncProgressMessages as englishCopy } from "@/messages/en.json";
import { settingsImportSyncProgressMessages as ukrainianCopy } from "@/messages/uk.json";

export function ImportSyncProgress({ job, syncInfo, lang, generic = false }: {
  job: Progress | null;
  syncInfo: ImportResponse;
  lang: Lang;
  generic?: boolean;
}) {
  const uk = lang === "uk", locale = uk ? "uk-UA" : "en-GB";
  const labels = importStateLabels[lang];
  const date = (value: string) => new Date(value).toLocaleString(locale);
  const calculationState = syncInfo.calculation?.state;
  const calculationMessage = calculationState === "COMPLETE"
    ? uk ? ukrainianCopy.calculationMessageMetricsRecalculated : englishCopy.calculationMessageMetricsRecalculated
    : ["WAITING_ENGINE", "PENDING", "RUNNING"].includes(calculationState ?? "")
      ? uk ? ukrainianCopy.calculationMessageInputsImportedUpdatingSalesAnd : englishCopy.calculationMessageInputsImportedUpdatingSalesAnd
      : calculationState === "FAILED"
        ? uk ? ukrainianCopy.calculationMessageCouldNotUpdateMetricsWe : englishCopy.calculationMessageCouldNotUpdateMetricsWe
        : null;
  return (
    <>
      {job && (
        <Text variant="body" className="leading-normal mt-2 break-all text-sm text-(--muted)">
          {uk ? ukrainianCopy.cycle : englishCopy.cycle}: {job.id}
        </Text>
      )}
      {job?.state === "COMPLETE" && (
        <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
          {uk ? ukrainianCopy.completed : englishCopy.completed}:{" "}
          {date(job.updatedAt)}
        </Text>
      )}
      <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
        {uk ? ukrainianCopy.lastSchedulerTick : englishCopy.lastSchedulerTick}:{" "}
        {syncInfo.lastTickAt
          ? date(syncInfo.lastTickAt)
          : uk
            ? ukrainianCopy.noneYetConnectAn
            : englishCopy.noneYetConnectAn}
      </Text>
      {syncInfo.backfill && (
        <Text variant="body" className="leading-normal mt-2 text-sm text-(--muted)">
          {uk ? ukrainianCopy.historicalImport : englishCopy.historicalImport}:{" "}
          {labels[syncInfo.backfill.state] ?? syncInfo.backfill.state};{" "}
          {uk ? ukrainianCopy.pages : englishCopy.pages} {syncInfo.backfill.stats.pages ?? 0};{" "}
          {uk ? ukrainianCopy.orders : englishCopy.orders}{" "}
          {syncInfo.backfill.stats.orders ?? 0}.
        </Text>
      )}
      {syncInfo.resources?.map((r) => (
        <Text variant="body" key={r.resource} className="leading-normal mt-3 text-sm text-(--muted)">
          {r.resource === "orders"
            ? uk
              ? ukrainianCopy.orders2
              : englishCopy.orders2
            : uk
              ? ukrainianCopy.stock
              : englishCopy.stock}
          : {uk ? ukrainianCopy.lastCompletion : englishCopy.lastCompletion}{" "}
          {r.lastSuccess
            ? date(r.lastSuccess)
            : uk
              ? ukrainianCopy.noneYet
              : englishCopy.noneYet}
          ; {uk ? ukrainianCopy.pending : englishCopy.pending}{" "}
          {r.pending.toLocaleString(locale)}.{" "}
          {r.lagSeconds !== null &&
            `${uk ? ukrainianCopy.lagMin : englishCopy.lagMin}: ${Math.ceil(r.lagSeconds / 60).toLocaleString(locale)}.`}{" "}
          {r.errorCode && errorLabel(r.errorCode, uk,generic)}
        </Text>
      ))}
      <div role="status" aria-live="polite">
        {calculationMessage && <Text variant="body" className="mt-3 leading-normal text-(--muted)">{calculationMessage}</Text>}
      </div>
      {job?.state === "PAUSED" && (
        <Text variant="body" className="leading-normal mt-3 text-sm text-(--muted)">
          {uk
            ? ukrainianCopy.resumeThisCycleAfterCorrecting
            : englishCopy.resumeThisCycleAfterCorrecting}
        </Text>
      )}
    </>
  );
}
