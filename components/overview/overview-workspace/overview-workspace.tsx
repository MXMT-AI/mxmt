"use client";

import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { useMerchandisingFilters, useScenarioExportPermission } from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { overviewCopy } from "@/lib/overview-copy";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
import OverviewContent from "../overview-content/overview-content";
import { OverviewChatPanel } from "../overview-chat-panel/overview-chat-panel";

export default function OverviewWorkspace() {
  const filters = useMerchandisingFilters()!;
  const { lang } = useLang();
  const copy = overviewCopy[lang];
  const params = useSearchParams();
  const allowed = useScenarioExportPermission();
  const [chatLoaded, setChatLoaded] = useState(params.get("chat") === "1");
  const { data, busy, error, refresh } = useMerchandisingScreen(filters, "overview");

  if (error) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh} />;
  if (busy || !data) {
    return (
      <div role="status" aria-live="polite" className="py-6">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-3 text-sm text-(--muted)">{copy.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportReadiness data={data.readiness} lang={lang} />
      <OverviewContent
        data={data}
        lang={lang}
        query={params.toString()}
        monobrand={data.context.profileMode === "MONOBRAND"}
        onRefresh={refresh}
      />
      <OverviewChatPanel snapshotId={data.context.snapshotId} lang={lang} allowed={allowed} loaded={chatLoaded} onLoad={() => setChatLoaded(true)} />
    </div>
  );
}
