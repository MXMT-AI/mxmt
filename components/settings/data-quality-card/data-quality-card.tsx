"use client";
import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { Text } from "@/components/ui/text/text";
import { BrandAliasesSection } from "../brand-aliases-section/brand-aliases-section";
import { DataQualityMovements } from "../data-quality-movements/data-quality-movements";
import { DataQualityProducts } from "../data-quality-products/data-quality-products";
import { qualityAmountLabel } from "./data-quality-labels";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useQualityMutation } from "./use-quality-mutation";
import DataQualitySummary from "../data-quality-summary/data-quality-summary";
import ImportIssueList from "../import-issue-list/import-issue-list";
import { useQualitySelection } from "./use-quality-selection";
import { useDataQuality } from "./use-data-quality";
import { settingsDataQualityCardMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityCardMessages as ukrainianCopy } from "@/messages/uk.json";
export default function DataQualityCard({
  lang,
  canManage,
  revision = 0,
}: {
  lang: "uk" | "en";
  canManage: boolean;
  revision?: number;
}) {
  const uk = lang === "uk",
    locale = uk ? "uk-UA" : "en-GB";
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [alias, setAlias] = useState(""),
    [brandId, setBrandId] = useState(""),
    [dirty, setDirty] = useState(false);
  const { page, q, setQ, search, code, select } = useQualitySelection();
  const { data, loading, load } = useDataQuality({ page, search, code, revision, lang, onError: setError });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const productListRef = useRef<HTMLHeadingElement>(null),
    focusProducts = useRef(false);
  useEffect(() => {
    if (data && !loading && focusProducts.current) {
      focusProducts.current = false;
      productListRef.current?.focus();
    }
  }, [data, loading]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const { busy, save } = useQualityMutation({
    lang, canManage, loading, reload: load,
    onAliasSaved: () => { setDirty(false); setAlias(""); setBrandId(""); },
    onError: setError,
    onMessage: setMessage,
  });
  return (
    <section
      className={panel + " mb-10 p-5"}
      aria-labelledby="data-quality-title"
      aria-busy={busy || loading}
    >
      <Heading as="h2" variant="compact" id="data-quality-title" className="text-base">
        {uk ? ukrainianCopy.dataQuality : englishCopy.dataQuality}
      </Heading>
      <Text variant="body" className="mt-1 leading-normal text-(--muted)">
        {uk
          ? ukrainianCopy.currentCatalogExceptionsLinkedTo
          : englishCopy.currentCatalogExceptionsLinkedTo}
      </Text>
      {error && (
        <Text
          variant="body"
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-3 leading-normal text-red-500"
        >
          {error}
        </Text>
      )}
      <Text variant="body" role="status" className="mt-3 leading-normal text-(--muted)">
        {message ||
          (loading || !data ? (uk ? ukrainianCopy.loading : englishCopy.loading) : "")}
      </Text>
      <Button
        variant="report"
        className="min-h-0 min-w-0 bg-(--surface) px-3 text-(--text) hover:bg-(--bg) focus-visible:outline-(--text)"
        disabled={busy || loading}
        onClick={() => {
          setError("");
          load().catch(() =>
            setError(
              uk
                ? ukrainianCopy.couldNotRefreshDataTry
                : englishCopy.couldNotRefreshDataTry,
            ),
          );
        }}
      >
        {uk ? ukrainianCopy.refreshDiagnostics : englishCopy.refreshDiagnostics}
      </Button>
      {data && (
        <>
          <DataQualitySummary
            summary={data.summary}
            affectedStock={data.affectedStock ?? []}
            lang={lang}
            selected={code}
            onSelect={(c) => {
              focusProducts.current = true;
              select(c);
            }}
          />
          <ImportIssueList lang={lang} revision={revision} />
          {data.stock
            ?.filter((row) => row.brandKey === "UNBRANDED")
            .map((row) => (
              <Text
                variant="body"
                key={row.currency ?? englishCopy.keyUnknown}
                className="mt-3 leading-normal text-(--text)"
              >
                {uk
                  ? ukrainianCopy.unbrandedMerchandiseStock
                  : englishCopy.unbrandedMerchandiseStock}
                :{" "}
                {row.quantity === null
                  ? uk
                    ? ukrainianCopy.unknown
                    : englishCopy.unknown
                  : Number(row.quantity).toLocaleString(locale)}{" "}
                · {qualityAmountLabel(row.costValue, row.currency, lang)}
              </Text>
            ))}
          <DataQualityMovements
            components={data.components}
            orderExceptions={data.orderExceptions}
            replayRequired={data.normalizationReplayRequired}
            lang={lang}
          />
          <DataQualityProducts
            rows={data.rows}
            pagination={data.pagination}
            page={page}
            code={code}
            query={q}
            lang={lang}
            canManage={canManage}
            disabled={busy || loading}
            headingRef={productListRef}
            onQueryChange={setQ}
            onSearch={() => select(code, 1, q)}
            onPage={page => select(code, page)}
            onKindChange={(skuId, productKind) => save({ action: "productKind", skuId, productKind })}
          />
          <BrandAliasesSection
            aliases={data.aliases}
            brands={data.brands}
            alias={alias}
            brandId={brandId}
            lang={lang}
            canManage={canManage}
            busy={busy}
            loading={loading}
            onAliasChange={value => { setAlias(value); setDirty(true); }}
            onBrandChange={value => { setBrandId(value); setDirty(true); }}
            onSave={(alias, brandId) => save({ action: "alias", alias, brandId })}
          />
        </>
      )}
    </section>
  );
}
