import type { ComponentProps, ReactNode } from "react";
import type { Lang } from "@/lib/translations";
import type { OverviewResponse, useMerchandisingScreen } from "../use-merchandising-screen";
import ReportReadiness from "../report-readiness/report-readiness";
import ReportingError from "../reporting-error/reporting-error";
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
  if (error) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh} />;
  if (busy || !data) {
    return <WorkspaceLoading {...loadingProps} title={copy.title} message={copy.loading} />;
  }

  return (
    <div className={className}>
      <ReportReadiness data={data.readiness} lang={lang} />
      {children(data, refresh)}
    </div>
  );
}
