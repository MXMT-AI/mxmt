"use client";
import { ReportWorkspaceFrame } from "@/components/merchandising/report-workspace-frame/report-workspace-frame";
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
  const state = useMerchandisingScreen(filters, "sales", controls);

  return (
    <ReportWorkspaceFrame state={state} lang={lang} copy={salesCopy[lang]} loadingProps={{ messageClassName: "mt-4 text-base" }}>
      {(data, refresh) => (
        <SalesContent data={data} lang={lang} query={params.toString()} onRefresh={refresh} />
      )}
    </ReportWorkspaceFrame>
  );
}
