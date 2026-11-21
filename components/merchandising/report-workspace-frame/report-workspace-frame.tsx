import type { ComponentProps, ReactNode } from "react";
import type { Lang } from "@/lib/translations";
import type { OverviewResponse, useMerchandisingScreen } from "../use-merchandising-screen";
import ReportReadiness from "../report-readiness/report-readiness";
import ReportingError from "../reporting-error/reporting-error";
import { PublishedReportStatus } from "../published-report-status/published-report-status";
import { WorkspaceLoading } from "../workspace-loading/workspace-loading";

export function ReportWorkspaceFrame({
  state: { data, busy, error, refresh },
  lang,
  copy,
  className = "space-y-5",
  loadingProps,
  children,
}: {
  state: ReturnType<typeof useMerchandisingScreen>;
  lang: Lang;
  copy: { title: string; loading: string };
  className?: string;
  loadingProps?: Pick<ComponentProps<typeof WorkspaceLoading>, "className" | "aria-live" | "messageClassName">;
  children: (data: OverviewResponse, refresh: () => void) => ReactNode;
}) {
  const keepPublished = Boolean(data?.publishedAt);
  if (error && !keepPublished) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh} />;
  if (!data || (busy && !keepPublished)) {
    return <WorkspaceLoading {...loadingProps} title={copy.title} message={copy.loading} />;
  }

  return (
    <div className={className}>
      <ReportReadiness data={data.readiness} lang={lang} />
      {children(data, refresh)}
      {keepPublished ? <PublishedReportStatus publishedAt={data.publishedAt} busy={busy} lang={lang} /> : null}
      {error ? <ReportingError code={error} lang={lang} onRetry={refresh} /> : null}
    </div>
  );
}
