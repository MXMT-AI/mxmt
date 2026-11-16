"use client";
import { WorkspaceLoading } from "@/components/merchandising/workspace-loading/workspace-loading";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { useMerchandisingFilters } from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
import { stockCopy } from "@/lib/stock-copy";
import { stockWorkspaceControls } from "../stock-workspace-controls";
import StockContent from "../stock-content/stock-content";
export default function StockWorkspace() {
  const filters = useMerchandisingFilters()!,
    params = useSearchParams(),
    router = useRouter(),
    { lang } = useLang();
  const controls = stockWorkspaceControls(params);
  const { data, busy, error, refresh } = useMerchandisingScreen(
      filters,
      "stock",
      controls,
    ),
    copy = stockCopy[lang];
  if (error) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh}/>;
  if (busy || !data)
    return <WorkspaceLoading title={copy.title} message={copy.loading} />;

  return (
    <div className="space-y-5">
      <ReportReadiness data={data.readiness} lang={lang}/>
      <StockContent
        data={data}
        lang={lang}
        query={params.toString()}
        onRefresh={refresh}
        onNavigate={(url) => router.push(url, { scroll: false })}
      />
    </div>
  );
}
