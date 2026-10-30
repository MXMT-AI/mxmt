"use client";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/fetch";
import type { ReportingSources } from "@/lib/reporting-source-contract";
import { reportingSourceHelp } from "@/lib/reporting-readiness-copy";
import { useLang } from "@/components/LanguageProvider";
export default function ReportingSourceStatus({
  explainTabs = false,
  compact = false,
}: {
  explainTabs?: boolean;
  compact?: boolean;
}) {
  const { lang } = useLang(),
    uk = lang === "uk";
  const [data, setData] = useState<ReportingSources | null>(null),
    [error, setError] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError(false);
    apiFetch("/api/connectors/source", {
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const body = (await response.json()) as ReportingSources;
        if (!abort.signal.aborted) setData(body);
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    const changed = () => setReload((n) => n + 1);
    window.addEventListener("connector-connection-changed", changed);
    return () => {
      abort.abort();
      window.removeEventListener("connector-connection-changed", changed);
    };
  }, [reload]);
  const selected = data?.connections.find(
      (source) => source.sourceId === data.sourceId,
    ),
    help = reportingSourceHelp(selected, lang);
  return (
    <section
      aria-label={uk ? "Стан джерела звітів" : "Reporting source status"}
      className="mb-5 rounded-lg border border-(--border) bg-(--surface) p-4 text-sm space-y-2"
    >
      {error ? (
        <>
          <p role="alert">
            {uk
              ? "Не вдалося перевірити джерело звітів."
              : "Could not check the reporting source."}
          </p>
          <button
            type="button"
            className="min-h-11 underline focus-visible:outline-solid focus-visible:outline-2"
            onClick={() => setReload((n) => n + 1)}
          >
            {uk ? "Повторити перевірку" : "Retry source check"}
          </button>
        </>
      ) : !data ? (
        <p role="status">
          {uk ? "Перевіряємо джерело звітів…" : "Checking reporting source…"}
        </p>
      ) : (
        <>
          <p className="font-medium">
            {uk ? "Джерело MVP-звітів: " : "MVP reporting source: "}
            {selected
              ? `${selected.provider === "sheets" ? "Google Sheets" : selected.provider === "salesdrive" ? "SalesDrive" : selected.provider} · ${selected.accountHost}`
              : uk
                ? "не вибрано"
                : "not selected"}
          </p>
          {!compact ? (
            <p className="max-w-prose text-(--muted)">{help.message}</p>
          ) : null}
          {!compact ? (
            <Link
              className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-solid focus-visible:outline-2"
              href={help.href}
            >
              {help.action}
            </Link>
          ) : null}
        </>
      )}
      {explainTabs ? (
        <p className="max-w-prose text-(--muted)">
          {uk
            ? "Вкладки Google Sheets / SalesDrive перемикають перегляд даних. Джерело для п’яти MVP-екранів вибирається окремо в налаштуваннях."
            : "The Google Sheets / SalesDrive tabs switch data views. Select the source for the five MVP screens separately in Settings."}
        </p>
      ) : null}
    </section>
  );
}
