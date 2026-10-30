"use client";
import ReportingError from "@/components/merchandising/ReportingError";
import ReportReadiness from "@/components/merchandising/ReportReadiness";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { useMerchandisingFilters } from "@/components/merchandising/MerchandisingShell";
import { useMerchandisingScreen } from "@/components/merchandising/useMerchandisingScreen";
import { stockCopy } from "@/lib/stock-copy";
import StockContent from "./StockContent";
/** Load frozen stock independently of the shared sales-channel selection. */
export default function StockWorkspace() {
  const filters = useMerchandisingFilters()!,
    params = useSearchParams(),
    router = useRouter(),
    { lang } = useLang();
  const controls: Record<string, string> = {
    groupBy: params.get("groupBy") === "sku" ? "sku" : "category",
    sort: params.get("sort") ?? "stockCost",
    direction: params.get("direction") ?? "desc",
  };
  for (const key of [
    "classification",
    "ownership",
    "supplierId",
    "page",
    "categoryPage",
    "brandPage",
    "categorySort",
    "categoryDirection",
  ]) {
    const value = params.get(key);
    if (value) controls[key] = value;
  }
  const { data, busy, error, refresh } = useMerchandisingScreen(
      filters,
      "stock",
      controls,
    ),
    copy = stockCopy[lang];
  if (error) return <ReportingError code={error} lang={lang} title={copy.title} onRetry={refresh}/>;
  if (busy || !data)
    return (
      <div role="status">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-3 text-sm text-(--muted)">{copy.loading}</p>
      </div>
    );
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
