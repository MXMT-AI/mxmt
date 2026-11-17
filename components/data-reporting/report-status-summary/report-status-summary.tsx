import { ReportStatusCard } from "../report-status-card/report-status-card";
import type { DataStatus } from "../use-report-status/use-report-status";

export function ReportStatusSummary({ status, loading, locale, copy }: {
  status: DataStatus | null;
  loading: boolean;
  locale: string;
  copy: { dataStatus: string; source: string; noSource: string; lastImport: string; report: string; noRuns: string; issues: string; warning: string; success: string };
}) {
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const dateTime = (value: string | null | undefined) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatter.format(date);
  };
  const lastImportDate = status?.activeImport?.completedAt
    ?? status?.activeImport?.finishedAt
    ?? status?.activeImport?.activatedAt
    ?? status?.latestImport?.finishedAt
    ?? status?.latestImport?.createdAt;
  const calculationDate = status?.calculation?.completedAt ?? status?.calculation?.finishedAt ?? status?.calculation?.createdAt;
  const importStatus = status?.activeImport?.status ?? status?.latestImport?.status;
  const issueTotal = Object.values(status?.issueCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const cards = [
    { key: "source", label: copy.source, value: status?.source?.name ?? copy.noSource, detail: status?.source?.timezone ?? "Europe/Kyiv" },
    { key: "import", label: copy.lastImport, value: dateTime(lastImportDate), detail: importStatus ?? copy.noRuns, status: importStatus },
    { key: "calculation", label: copy.report, value: dateTime(calculationDate), detail: status?.calculation?.status ?? copy.noRuns, status: status?.calculation?.status },
    { key: "issues", label: copy.issues, value: String(issueTotal), detail: issueTotal > 0 ? copy.warning : copy.success, status: issueTotal > 0 ? "WARNING" : "SUCCESS" },
  ];

  return (
    <section aria-label={copy.dataStatus} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
      {cards.map(({ key, ...card }) => <ReportStatusCard key={key} {...card} loading={loading} />)}
    </section>
  );
}
