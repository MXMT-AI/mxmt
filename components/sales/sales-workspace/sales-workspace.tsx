"use client";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import {
  useMerchandisingFilters,
  useMerchandisingOptions,
} from "@/components/merchandising/merchandising-shell/merchandising-shell";
import { useMerchandisingScreen } from "@/components/merchandising/use-merchandising-screen";
import { merchandisingGroup } from "@/lib/merchandising-navigation";
import { salesCopy } from "@/lib/sales-copy";
import SalesContent from "../sales-content/sales-content";
export default function SalesWorkspace() {
  const filters = useMerchandisingFilters()!,
    options = useMerchandisingOptions(),
    params = useSearchParams(),
    { lang } = useLang();
  const controls: Record<string, string> = {
    groupBy: merchandisingGroup(
      new URLSearchParams(params),
      options?.monobrand ?? true,
    ),
  };
  for (const key of ["metric", "measure", "others", "page", "channelPage"]) {
    const value = params.get(key);
    if (value) controls[key] = value;
  }
  const { data, busy, error, refresh } = useMerchandisingScreen(
      filters,
      "sales",
      controls,
    ),
    copy = salesCopy[lang];
  if (error) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh}/>;
  if (busy || !data)
    return (
      <div role="status">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-4 text-(--muted)">{copy.loading}</p>
      </div>
    );
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
