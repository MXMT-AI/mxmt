"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useLang } from "@/components/language-provider/language-provider";
import { ActionLink } from "@/components/ui/action-link/action-link";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import type { ClassifiedSku, ClassifySummary } from "@/lib/analyst-types";

import { AnalystChat } from "../analyst-chat/analyst-chat";
import { AnalystFilterButtons, AnalystFilterCards } from "../analyst-filters/analyst-filters";
import { AnalystSkuTable } from "../analyst-sku-table/analyst-sku-table";
import type { AnalystFilter } from "../sku-flags";

interface Props {
  initialSkus: ClassifiedSku[];
  initialSummary: ClassifySummary;
  businessModel: string | null;
  tenantName: string;
}

export default function AnalystApp({ initialSkus, initialSummary, businessModel, tenantName }: Props) {
  const { lang } = useLang();
  const uk = lang === "uk";
  const locale: "uk" | "en" = uk ? "uk" : "en";

  const [skus, setSkus] = useState(initialSkus);
  const [summary, setSummary] = useState(initialSummary);
  const [activeFlag, setActiveFlag] = useState<AnalystFilter>("all");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const empty = summary.total === 0 && !loading;

  async function reload(flag: AnalystFilter) {
    setLoading(true);
    try {
      const params = flag === "all" ? "" : `?flag=${flag}`;
      const res = await fetch(`/api/analyst/classify${params}`);
      const data = await res.json();
      setSkus(data.skus);
      setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  }

  function setFilter(flag: AnalystFilter) {
    setActiveFlag(flag);
    setPage(1);
    void reload(flag);
  }

  const filters = { summary, locale, activeFlag, onFilter: setFilter };

  return (
    <div className={empty ? "max-w-3xl p-8" : "max-w-full p-6"}>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Text variant="body" className="mb-1 font-mono text-[10px] tracking-widest text-(--subtle) uppercase">
            {uk ? "Аналітика" : "Analytics"}
          </Text>
          <Heading as="h1" variant="page" className="text-2xl tracking-normal">
            {uk ? "Агент Аналітик" : "Analyst Agent"}
          </Heading>
        </div>
        {!empty && (
          <Button onClick={() => void reload(activeFlag)} disabled={loading} className="px-3 py-2 font-sans text-sm">
            <RefreshCw size={13} className={loading ? "motion-safe:animate-spin" : undefined} aria-hidden="true" />
            {uk ? "Оновити" : "Refresh"}
          </Button>
        )}
      </header>

      {empty ? (
        <section className="mt-8 rounded-xl border border-accent-yellow/20 bg-(--surface) p-8 text-center">
          <div className="mb-3 text-3xl" aria-hidden="true">📦</div>
          <Heading as="h2" variant="compact" className="mb-2 text-base">
            {uk ? "Немає даних для аналізу" : "No data to analyze"}
          </Heading>
          <Text variant="body" className="mb-4">
            {uk
              ? "Імпортуйте товари та дані продажів щоб агент міг класифікувати асортимент"
              : "Import products and sales data so the agent can classify your assortment"}
          </Text>
          <ActionLink
            href="/settings"
            variant="secondary"
            className="min-h-0 rounded-lg border-accent-yellow/20 bg-accent-yellow/10 px-4 py-2 font-medium text-accent-yellow hover:border-accent-yellow/20 hover:bg-accent-yellow/20 hover:text-accent-yellow"
          >
            {uk ? "Підключити дані →" : "Connect data →"}
          </ActionLink>
        </section>
      ) : (
        <>
          <AnalystFilterCards {...filters} />
          <AnalystChat skus={skus} summary={summary} businessModel={businessModel} tenantName={tenantName} lang={lang} />
          <AnalystSkuTable
            skus={skus}
            locale={locale}
            page={page}
            onPageChange={setPage}
            filters={<AnalystFilterButtons {...filters} />}
          />
        </>
      )}
    </div>
  );
}
