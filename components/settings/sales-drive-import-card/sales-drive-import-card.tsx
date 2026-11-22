"use client";

import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { panel } from "@/components/ui/panel/panel-styles";
import { importStateLabels } from "./copy";
import { useEffect, useRef } from "react";
import { useImportProgress, isImportRunning } from "./use-import-progress";

import { ImportSyncProgress } from "../import-sync-progress/import-sync-progress";
import { ImportJobDetails } from "../import-job-details/import-job-details";
import { settingsSalesDriveImportCardMessages as englishCopy } from "@/messages/en.json";
import { settingsSalesDriveImportCardMessages as ukrainianCopy } from "@/messages/uk.json";

export default function SalesDriveImportCard({
  lang,
  canManage,
  resource = "orders",
  onCompleted,
  generic = false,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  resource?: "orders" | "inventory" | "sync";
  onCompleted?: () => void;
  generic?: boolean;
}) {
  const uk = lang === "uk";
  const inventory = resource === "inventory",
    sync = resource === "sync";
  const headingId = `${generic?"connector":"salesdrive"}-${resource}-import-title`;
  const { syncInfo, job, coverage, loaded, busy, error, setError, load, act, polling } =
    useImportProgress({ lang, canManage, resource, generic, onCompleted });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const labels = importStateLabels[lang];
  return (
    <section
      className={panel + " mb-10 p-5"}
      aria-labelledby={headingId}
      aria-busy={busy}
    >
      <Heading as="h2" variant="compact" id={headingId} className="text-base">
        {sync
          ? uk
            ? generic?ukrainianCopy.синхронізаціяДаних:ukrainianCopy.синхронізаціяSalesDrive
            : generic?englishCopy.dataSynchronization:englishCopy.salesDriveSynchronization
          : inventory
            ? uk
              ? generic?ukrainianCopy.каталогІЗалишки:ukrainianCopy.каталогІЗалишкиSalesDrive
              : generic?englishCopy.catalogueAndStock:englishCopy.salesDriveCatalogueAndStock
            : uk
              ? generic?ukrainianCopy.історіяЗамовлень:ukrainianCopy.історіяЗамовленьSalesDrive
              : generic?englishCopy.orderHistory:englishCopy.salesDriveOrderHistory}
      </Heading>
      <Text variant="body" className="leading-normal mt-1 text-sm text-(--muted)">
        {sync
          ? uk
            ? ukrainianCopy.ordersEveryTwoHoursStock
            : englishCopy.ordersEveryTwoHoursStock
          : inventory
            ? uk
              ? ukrainianCopy.receiptsCatalogueAndCurrentStock
              : englishCopy.receiptsCatalogueAndCurrentStock
            : uk
              ? ukrainianCopy.twoYearsOfHistoryThen
              : englishCopy.twoYearsOfHistoryThen}
      </Text>
      <Text variant="body" className="leading-normal mt-3 text-sm text-(--text)" role="status">
        {!loaded
          ? uk
            ? ukrainianCopy.loading
            : englishCopy.loading
          : job
            ? (labels[job.state] ?? job.state)
            : uk
              ? ukrainianCopy.noImportHasBeenStarted
              : englishCopy.noImportHasBeenStarted}
      </Text>
      {job && <ImportJobDetails job={job} resource={resource} lang={lang} generic={generic} />}
      {sync && <ImportSyncProgress job={job} syncInfo={syncInfo} lang={lang} generic={generic} />}
      {inventory && coverage && (
        <Text variant="body" className="leading-normal mt-3 text-sm text-(--muted)">
          {coverage.firstObservedAt
            ? `${uk ? ukrainianCopy.firstObservation : englishCopy.firstObservation}: ${new Date(coverage.firstObservedAt).toLocaleString(uk ? "uk-UA" : "en-GB")}. ${uk ? ukrainianCopy.daysWithSnapshots : englishCopy.daysWithSnapshots}: ${coverage.observedDays}. ${uk ? ukrainianCopy.missingDays : englishCopy.missingDays}: ${coverage.missingDays ?? 0}. ${uk ? ukrainianCopy.earlierHistoryIsUnavailable : englishCopy.earlierHistoryIsUnavailable}`
            : uk
              ? ukrainianCopy.noStockHistoryYetThe
              : englishCopy.noStockHistoryYetThe}
        </Text>
      )}
      {error && (
        <Text variant="body"
          ref={errorRef}
          tabIndex={-1}
          className="leading-normal mt-3 text-sm text-red-500"
          role="alert"
        >
          {error}
        </Text>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {canManage && (
          <>
            <Button variant="report"
              className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
              disabled={
                !loaded ||
                busy ||
                isImportRunning(job) ||
                job?.state === "PAUSED" ||
                job?.state === "FAILED"
              }
              onClick={() =>
                act(sync ? "refresh" : inventory ? "start" : "backfill")
              }
            >
              {sync
                ? uk
                  ? ukrainianCopy.refreshData
                  : englishCopy.refreshData
                : inventory
                  ? uk
                    ? ukrainianCopy.refreshCatalogueAndStock
                    : englishCopy.refreshCatalogueAndStock
                  : uk
                    ? ukrainianCopy.importTwoYears
                    : englishCopy.importTwoYears}
            </Button>
            {!inventory && !sync && (
              <Button variant="report"
                className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                disabled={!loaded || busy || !job || job.state !== "COMPLETE"}
                onClick={() => act("incremental")}
              >
                {uk ? ukrainianCopy.importChanges : englishCopy.importChanges}
              </Button>
            )}
            {job && ["PAUSED", "FAILED"].includes(job.state) && (
              <Button variant="report"
                className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                disabled={busy}
                onClick={() => act("resume")}
              >
                {uk ? ukrainianCopy.resume : englishCopy.resume}
              </Button>
            )}
            {sync &&
              syncInfo.backfill &&
              ["PAUSED", "FAILED"].includes(syncInfo.backfill.state) && (
                <Button variant="report"
                  className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                  disabled={busy}
                  onClick={() => act("resumeBackfill")}
                >
                  {uk
                    ? ukrainianCopy.resumeHistoricalImport
                    : englishCopy.resumeHistoricalImport}
                </Button>
              )}
            {polling && (
              <Button variant="report"
                className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                disabled={busy || (!sync && job?.state === "RUNNING")}
                onClick={() => act("step")}
              >
                {uk ? ukrainianCopy.processNextPage : englishCopy.processNextPage}
              </Button>
            )}
          </>
        )}
        <Button variant="report"
          className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
          disabled={busy}
          onClick={() => {
            setError("");
            load().catch(() =>
              setError(
                uk
                  ? ukrainianCopy.couldNotRefreshProgress
                  : englishCopy.couldNotRefreshProgress,
              ),
            );
          }}
        >
          {uk ? ukrainianCopy.refreshProgress : englishCopy.refreshProgress}
        </Button>
      </div>
    </section>
  );
}
