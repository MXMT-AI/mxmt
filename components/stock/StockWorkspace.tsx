"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { useMerchandisingFilters } from "@/components/merchandising/MerchandisingShell";
import { useMerchandisingScreen } from "@/components/merchandising/useMerchandisingScreen";
import { button } from "@/components/merchandising/ReportPrimitives";
import { stockCopy } from "@/lib/stock-copy";
import { merchandisingHref } from "@/lib/merchandising-navigation";
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
  if (error)
    return (
      <div role="alert" className="space-y-4">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>{copy.error}</p>
        <div className="flex gap-3">
          <button type="button" className={button} onClick={refresh}>
            {copy.refresh}
          </button>
          <Link
            className={button}
            href={merchandisingHref("/settings", new URLSearchParams(params))}
          >
            {copy.settings}
          </Link>
        </div>
      </div>
    );
  if (busy || !data)
    return (
      <div role="status">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{copy.loading}</p>
      </div>
    );
  return (
    <StockContent
      data={data}
      lang={lang}
      query={params.toString()}
      onRefresh={refresh}
      onNavigate={(url) => router.push(url, { scroll: false })}
    />
  );
}
