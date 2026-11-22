"use client";
import { Heading } from "@/components/ui/heading/heading";

import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { control } from "@/components/ui/control-styles/control-styles";
import { Field } from "@/components/ui/field/field";
import type { RepricingDraft } from "@/lib/repricing-workspace";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingFailure } from "../use-repricing-preview";
import { Choice } from "@/components/ui/choice/choice";
import { RangeField } from "@/components/ui/range-field/range-field";
import { activeRepricingFilters, defaultRepricingFilters } from "@/lib/repricing-workspace";
import type { RepricingFilters as FilterValues } from "@/lib/repricing-contract";
import type { RepricingPreview } from "../use-repricing-preview";
import { repricingRepricingFiltersMessages as englishCopy } from "@/messages/en.json";

export function RepricingFilters({ monobrand = false, draft, onChange, data, error, copy }: {
  monobrand?: boolean;
  draft: RepricingDraft;
  onChange: (draft: RepricingDraft) => void;
  data: RepricingPreview | null;
  error: RepricingFailure | null;
  copy: RepricingCopy;
}) {
  const f = draft.filters;
  const setFilter = (key: keyof FilterValues, value: string | number) => {
    const filters = { ...f };
    if (value === "") delete (filters as Record<string, unknown>)[key];
    else Object.assign(filters, { [key]: value });
    onChange({ ...draft, filters });
  };
  const filterError = error?.details.some(detail => detail.startsWith("filters."));
  return (
    <section
      className={panel + " p-5 space-y-4"}
      aria-labelledby="repricing-filters"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading as="h2" variant="compact" id="repricing-filters" className="text-base text-inherit">
          {copy.filters}{" "}
          <span className="ml-2 text-xs font-normal text-(--muted)">
            {copy.active}: {activeRepricingFilters(f)}
          </span>
        </Heading>
        <Button
          variant="report"
          onClick={() =>
            onChange({ ...draft, filters: defaultRepricingFilters() })
          }
        >
          {copy.reset}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label={copy.status}>
          <select
            className={control}
            name="status"
            value={f.status}
            onChange={(e) => setFilter("status", e.target.value)}
          >
            {Object.entries(copy.statuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {!monobrand && (
          <Choice
            label={copy.brand}
            value={f.brandId ?? ""}
            options={data?.filterOptions.brands ?? []}
            all={copy.allBrands}
            copy={copy}
            onChange={(v) => setFilter("brandId", v)}
          />
        )}
        <Choice
          label={copy.category}
          value={f.categoryId ?? ""}
          options={data?.filterOptions.categories ?? []}
          all={copy.allCategories}
          copy={copy}
          onChange={(v) => setFilter("categoryId", v)}
        />
        <RangeField
          label={copy.price}
          fromLabel={copy.from}
          toLabel={copy.to}
          from={{ name: "priceMin", value: f.priceMin ?? "", onChange: value => setFilter("priceMin", value) }}
          to={{ name: "priceMax", value: f.priceMax ?? "", onChange: value => setFilter("priceMax", value) }}
          invalid={!!filterError}
          describedBy={filterError ? "repricing-filter-error" : undefined}
        />
        <RangeField
          label={copy.stock}
          fromLabel={copy.from}
          toLabel={copy.to}
          from={{ name: "stockMin", value: f.stockMin ?? "", onChange: value => setFilter("stockMin", value) }}
          to={{ name: "stockMax", value: f.stockMax ?? "", onChange: value => setFilter("stockMax", value) }}
          invalid={!!filterError}
          describedBy={filterError ? "repricing-filter-error" : undefined}
        />
        <Field label={copy.soldPeriod}>
          <select
            className={control}
            name="soldMonths"
            value={f.soldMonths}
            onChange={(e) => setFilter("soldMonths", Number(e.target.value))}
          >
            {[1, 3, 7].map((m) => (
              <option key={m} value={m}>
                {m} {copy.months}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.soldMax}>
          <input
            className={control}
            aria-invalid={!!filterError}
            aria-describedby={
              filterError ? "repricing-filter-error" : undefined
            }
            name="soldMax"
            inputMode="decimal"
            autoComplete="off"
            value={f.soldMax ?? ""}
            placeholder={englishCopy.placeholder0}
            onChange={(e) => setFilter("soldMax", e.target.value)}
          />
        </Field>
        <Field label={copy.currency}>
          <select
            className={control}
            name="currency"
            value={f.currency ?? "UAH"}
            onChange={(e) => setFilter("currency", e.target.value)}
          >
            {[...new Set(["UAH", f.currency ?? "UAH"])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {f.skuId ? (
        <div className="flex items-center gap-3 text-xs">
          <span translate="no">
            {copy.sku}: {f.skuId}
          </span>
          <Button
          variant="report"
            onClick={() => setFilter("skuId", "")}
          >
            {copy.clearSku}
          </Button>
        </div>
      ) : null}
      {filterError ? (
        <p id="repricing-filter-error" role="alert" className="text-sm">
          {copy.filterError}
        </p>
      ) : null}
      <Note>
        {copy.filterNote}{" "}
        {data
          ? `${copy.shown} ${data.counts.matchedSkuCount} ${copy.of} ${data.counts.candidateSkuCount} SKU. ${copy.eligible}: ${data.counts.eligibleSkuCount}.`
          : ""}
      </Note>
    </section>
  );
}
