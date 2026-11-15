"use client";

import { Link } from "@/i18n/navigation";
import { reportingSourceHelp } from "@/lib/reporting-readiness-copy";
import type { ReportingSourceProvider } from "@/lib/reporting-source-contract";
import { useLang } from "@/components/language-provider/language-provider";
import { useReportingSourceStatus } from "../use-reporting-source-status";
import { reportingSourceStatusCopy } from "./copy";

const providerNames: Partial<Record<ReportingSourceProvider, string>> = {
  sheets: "Google Sheets",
  salesdrive: "SalesDrive",
};

export default function ReportingSourceStatus({
  explainTabs = false,
  compact = false,
}: {
  explainTabs?: boolean;
  compact?: boolean;
}) {
  const { lang } = useLang();
  const copy = reportingSourceStatusCopy[lang];
  const { data, error, retry } = useReportingSourceStatus();
  const selected = data?.connections.find(source => source.sourceId === data.sourceId);
  const help = reportingSourceHelp(selected, lang);

  return (
    <section
      aria-label={copy.label}
      className="mb-5 rounded-lg border border-(--border) bg-(--surface) p-4 text-sm space-y-2"
    >
      {error ? (
        <>
          <p role="alert">{copy.error}</p>
          <button
            type="button"
            className="min-h-11 underline focus-visible:outline-solid focus-visible:outline-2"
            onClick={retry}
          >
            {copy.retry}
          </button>
        </>
      ) : !data ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <>
          <p className="font-medium">
            {copy.source}
            {selected
              ? `${providerNames[selected.provider] ?? selected.provider} · ${selected.accountHost}`
              : copy.unselected}
          </p>
          {!compact ? (
            <>
              <p className="max-w-prose text-(--muted)">{help.message}</p>
              <Link
                className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-solid focus-visible:outline-2"
                href={help.href}
              >
                {help.action}
              </Link>
            </>
          ) : null}
        </>
      )}
      {explainTabs ? <p className="max-w-prose text-(--muted)">{copy.tabs}</p> : null}
    </section>
  );
}
