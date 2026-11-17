"use client";

import { ReportWorkspaceFrame } from "@/components/merchandising/report-workspace-frame/report-workspace-frame";
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
  const state = useMerchandisingScreen(filters, "overview");

  return (
    <ReportWorkspaceFrame state={state} lang={lang} copy={copy} className="space-y-6" loadingProps={{ className: "py-6", "aria-live": "polite" }}>
      {(data, refresh) => (
        <>
          <OverviewContent
            data={data}
            lang={lang}
            query={params.toString()}
            monobrand={data.context.profileMode === "MONOBRAND"}
            onRefresh={refresh}
          />
          <OverviewChatPanel snapshotId={data.context.snapshotId} lang={lang} allowed={allowed} loaded={chatLoaded} onLoad={() => setChatLoaded(true)} />
        </>
      )}
    </ReportWorkspaceFrame>
  );
}
