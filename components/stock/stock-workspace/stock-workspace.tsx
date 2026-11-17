"use client";
import { ReportWorkspaceFrame } from "@/components/merchandising/report-workspace-frame/report-workspace-frame";
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
  const state = useMerchandisingScreen(filters, "stock", controls);

  return (
    <ReportWorkspaceFrame state={state} lang={lang} copy={stockCopy[lang]}>
      {(data, refresh) => (
        <StockContent
          data={data}
          lang={lang}
          query={params.toString()}
          onRefresh={refresh}
          onNavigate={(url) => router.push(url, { scroll: false })}
        />
      )}
    </ReportWorkspaceFrame>
  );
}
