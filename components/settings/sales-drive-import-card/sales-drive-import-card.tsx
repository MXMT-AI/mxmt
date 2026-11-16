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
            ? generic?"Синхронізація даних":"Синхронізація SalesDrive"
            : generic?"Data synchronization":"SalesDrive synchronization"
          : inventory
            ? uk
              ? generic?"Каталог і залишки":"Каталог і залишки SalesDrive"
              : generic?"Catalogue and stock":"SalesDrive catalogue and stock"
            : uk
              ? generic?"Історія замовлень":"Історія замовлень SalesDrive"
              : generic?"Order history":"SalesDrive order history"}
      </Heading>
      <Text variant="body" className="leading-normal mt-1 text-sm text-(--muted)">
        {sync
          ? uk
            ? "Замовлення — кожні дві години. Залишки — о 03:00 за Києвом. Автоматичні оновлення потребують підключеного зовнішнього планувальника."
            : "Orders every two hours; stock at 03:00 Kyiv. Automatic updates require a connected external scheduler."
          : inventory
            ? uk
              ? "Надходження, каталог і поточні залишки. Історія залишків починається з першого спостереження."
              : "Receipts, catalogue and current stock. Stock history starts with the first observation."
            : uk
              ? "Історія за два роки, потім — оновлені замовлення. Імпорт зберігає прогрес між запусками."
              : "Two years of history, then updated orders. Progress is saved between runs."}
      </Text>
      <Text variant="body" className="leading-normal mt-3 text-sm text-(--text)" role="status">
        {!loaded
          ? uk
            ? "Завантаження…"
            : "Loading…"
          : job
            ? (labels[job.state] ?? job.state)
            : uk
              ? "Імпорт ще не запускався."
              : "No import has been started."}
      </Text>
      {job && <ImportJobDetails job={job} resource={resource} lang={lang} generic={generic} />}
      {sync && <ImportSyncProgress job={job} syncInfo={syncInfo} lang={lang} generic={generic} />}
      {inventory && coverage && (
        <Text variant="body" className="leading-normal mt-3 text-sm text-(--muted)">
          {coverage.firstObservedAt
            ? `${uk ? "Перше спостереження" : "First observation"}: ${new Date(coverage.firstObservedAt).toLocaleString(uk ? "uk-UA" : "en-GB")}. ${uk ? "Днів зі знімками" : "Days with snapshots"}: ${coverage.observedDays}. ${uk ? "Пропущених днів" : "Missing days"}: ${coverage.missingDays ?? 0}. ${uk ? "Раніша історія недоступна." : "Earlier history is unavailable."}`
            : uk
              ? "Історії залишків ще немає. Перший успішний імпорт створить поточний знімок."
              : "No stock history yet. The first successful import creates a current snapshot."}
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
                  ? "Оновити дані"
                  : "Refresh data"
                : inventory
                  ? uk
                    ? "Оновити каталог і залишки"
                    : "Refresh catalogue and stock"
                  : uk
                    ? "Імпортувати два роки"
                    : "Import two years"}
            </Button>
            {!inventory && !sync && (
              <Button variant="report"
                className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                disabled={!loaded || busy || !job || job.state !== "COMPLETE"}
                onClick={() => act("incremental")}
              >
                {uk ? "Імпортувати зміни" : "Import changes"}
              </Button>
            )}
            {job && ["PAUSED", "FAILED"].includes(job.state) && (
              <Button variant="report"
                className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                disabled={busy}
                onClick={() => act("resume")}
              >
                {uk ? "Відновити" : "Resume"}
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
                    ? "Відновити історичний імпорт"
                    : "Resume historical import"}
                </Button>
              )}
            {polling && (
              <Button variant="report"
                className="min-h-0 px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
                disabled={busy || (!sync && job?.state === "RUNNING")}
                onClick={() => act("step")}
              >
                {uk ? "Обробити наступну сторінку" : "Process next page"}
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
                  ? "Не вдалося оновити прогрес."
                  : "Could not refresh progress.",
              ),
            );
          }}
        >
          {uk ? "Оновити прогрес" : "Refresh progress"}
        </Button>
      </div>
    </section>
  );
}
