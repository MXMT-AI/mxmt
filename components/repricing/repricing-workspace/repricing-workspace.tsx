"use client";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { useMerchandisingFilters } from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
import { ScenarioWorkspaceHeader } from "@/components/merchandising/scenario-workspace-header/scenario-workspace-header";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { repricingCopy } from "@/lib/repricing-copy";
import RepricingEditor from "../repricing-editor/repricing-editor";
export default function RepricingWorkspace() {
  const filters = useMerchandisingFilters()!,
    params = useSearchParams(),
    { lang } = useLang(),
    copy = repricingCopy[lang];
  const { data, busy, error, refresh } = useMerchandisingScreen(
    filters,
    "repricing",
  );
  return (
    <div className="space-y-5">
      {data && !busy && !error ? <ReportReadiness data={data.readiness} lang={lang}/> : null}
      <ScenarioWorkspaceHeader
        backHref={merchandisingHref("/overview", new URLSearchParams(params))}
        copy={copy}
        busy={busy}
        onRefresh={refresh}
      />
      {error ? (
        <ReportingError code={error} lang={lang} onRetry={refresh}/>
      ) : busy || !data ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <RepricingEditor
          key={data.context.snapshotId}
          snapshotId={data.context.snapshotId}
          monobrand={data.context.profileMode === "MONOBRAND"}
          lang={lang}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
