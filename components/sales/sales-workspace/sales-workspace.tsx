"use client";
import { WorkspaceLoading } from "@/components/merchandising/workspace-loading/workspace-loading";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import {
  useMerchandisingFilters,
  useMerchandisingOptions,
} from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
import { salesWorkspaceControls } from "../sales-workspace-controls";
import { salesCopy } from "@/lib/sales-copy";
import SalesContent from "../sales-content/sales-content";
export default function SalesWorkspace() {
  const filters = useMerchandisingFilters()!,
    options = useMerchandisingOptions(),
    params = useSearchParams(),
    { lang } = useLang();
  const controls = salesWorkspaceControls(new URLSearchParams(params), options?.monobrand ?? true);
  const { data, busy, error, refresh } = useMerchandisingScreen(
      filters,
      "sales",
      controls,
    ),
    copy = salesCopy[lang];
  if (error) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh}/>;
  if (busy || !data)
    return <WorkspaceLoading title={copy.title} message={copy.loading} messageClassName="mt-4 text-base" />;

  return (
    <div className="space-y-5">
      <ReportReadiness data={data.readiness} lang={lang}/>
      <SalesContent
        data={data}
        lang={lang}
        query={params.toString()}
        onRefresh={refresh}
      />
    </div>
  );
}
