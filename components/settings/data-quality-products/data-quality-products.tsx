import type { Ref } from "react";
import { Heading } from "@/components/ui/heading/heading";
import { Field } from "@/components/ui/field/field";
import { Text } from "@/components/ui/text/text";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { qualityLabel } from "@/lib/data-quality-copy";
import type { Lang } from "@/lib/translations";
import type { Quality } from "../data-quality-card/data-quality-types";
import { DataQualityProductCard } from "../data-quality-product-card/data-quality-product-card";
import { settingsDataQualityProductsMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityProductsMessages as ukrainianCopy } from "@/messages/uk.json";

export function DataQualityProducts({ rows, pagination, page, code, query, lang, canManage, disabled, headingRef, onQueryChange, onSearch, onPage, onKindChange }: {
  rows: Quality["rows"];
  pagination: Quality["pagination"];
  page: number;
  code: string;
  query: string;
  lang: Lang;
  canManage: boolean;
  disabled: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onPage: (page: number) => void;
  onKindChange: (skuId: string, kind: string) => void | Promise<void>;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const pages = Math.max(1, Math.ceil(pagination.totalRows / pagination.pageSize));
  return (
    <>
      <Heading as="h3" variant="compact" ref={headingRef} tabIndex={-1} className="mt-6 text-base text-inherit scroll-mt-6 focus-visible:outline-solid">
        {code ? `${copy(ukrainianCopy.issue, englishCopy.issue)}: ${qualityLabel(code, lang)}` : copy(ukrainianCopy.products, englishCopy.products)}
      </Heading>
      <form className="mt-6 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); onSearch(); }}>
        <Field label={copy(ukrainianCopy.searchSKUOrName, englishCopy.searchSKUOrName)} className="flex-1 gap-0 text-sm">
          <input name="quality-search" autoComplete="off" maxLength={200} value={query} onChange={event => onQueryChange(event.target.value)} className={control + " mt-1 block w-full"} />
        </Field>
        <Button variant="report" type="submit" disabled={disabled}>{copy(ukrainianCopy.search, englishCopy.search)}</Button>
      </form>
      <div className="mt-4 space-y-4">
        {rows.map(row => <DataQualityProductCard key={row.id} row={row} lang={lang} canManage={canManage} disabled={disabled} onKindChange={onKindChange} />)}
      </div>
      {!rows.length && (
        <Text variant="body" className="mt-3 leading-normal text-(--muted)">
          {copy(ukrainianCopy.noProductsMatchThisIssue, englishCopy.noProductsMatchThisIssue)}
        </Text>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="report" disabled={page === 1 || disabled} onClick={() => onPage(page - 1)}>{copy(ukrainianCopy.previous, englishCopy.previous)}</Button>
        <span className="text-sm text-(--muted)">{page.toLocaleString(locale)} / {pages.toLocaleString(locale)}</span>
        <Button variant="report" disabled={page >= pages || disabled} onClick={() => onPage(page + 1)}>{copy(ukrainianCopy.next, englishCopy.next)}</Button>
      </div>
    </>
  );
}
