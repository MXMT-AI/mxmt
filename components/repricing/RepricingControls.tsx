"use client";
import { useId, useState, type ReactNode } from "react";
import {
  REPRICING_PRESETS,
  type RepricingFilters,
  type RepricingParameters,
} from "@/lib/repricing-contract";
import {
  activeRepricingFilters,
  defaultRepricingFilters,
  type RepricingDraft,
} from "@/lib/repricing-workspace";
import type { RepricingCopy } from "@/lib/repricing-copy";
import type { RepricingPreview, RepricingFailure } from "./useRepricingPreview";
import {
  panel,
  button,
  Note,
} from "@/components/merchandising/ReportPrimitives";
export const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--muted)]">
      {label}
      {children}
    </label>
  );
}
/** Bound native suggestions, while allowing deep-linked IDs and searching all frozen choices. */
function Choice({
  label,
  value,
  options,
  all,
  copy,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; name: string | null }>;
  all: string;
  copy: RepricingCopy;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    [search, setSearch] = useState("");
  const selected = options.find((o) => o.id === value);
  const matching = options
    .filter((o) =>
      (o.name ?? o.id).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .slice(0, 100);
  const visible =
    selected && !matching.some((o) => o.id === value)
      ? [selected, ...matching]
      : matching;
  return (
    <Field label={label}>
      {options.length > 100 ? (
        <input
          className={control}
          name={id + "-search"}
          type="search"
          aria-label={label + " — " + copy.optionsSearch}
          value={search}
          autoComplete="off"
          placeholder={copy.optionsSearch + "…"}
          onChange={(e) => setSearch(e.target.value)}
        />
      ) : null}
      <select
        className={control}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{all}</option>
        {value && !selected ? <option value={value}>{value}</option> : null}
        {visible.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name ?? copy.unassigned}
          </option>
        ))}
      </select>
    </Field>
  );
}
export default function RepricingControls({
  draft,
  onChange,
  data,
  error,
  copy,
}: {
  draft: RepricingDraft;
  onChange: (draft: RepricingDraft) => void;
  data: RepricingPreview | null;
  error: RepricingFailure | null;
  copy: RepricingCopy;
}) {
  const { parameters: p, filters: f } = draft;
  const setFilter = (key: keyof RepricingFilters, value: string | number) => {
    const filters = { ...f };
    if (value === "") delete (filters as Record<string, unknown>)[key];
    else Object.assign(filters, { [key]: value });
    onChange({ ...draft, filters });
  };
  const setParameter = (key: keyof RepricingParameters, value: unknown) =>
    onChange({ ...draft, parameters: { ...p, [key]: value } });
  const filterError = error?.details.some((d) => d.startsWith("filters."));
  const parameterError = error?.details.some((d) =>
    d.startsWith("parameters."),
  );
  const range = (
    label: string,
    minKey: "priceMin" | "stockMin",
    maxKey: "priceMax" | "stockMax",
  ) => (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs text-[var(--muted)]">{label}</legend>
      <div className="flex items-center gap-2">
        {([minKey, maxKey] as const).map((key, i) => (
          <input
            key={key}
            aria-label={label + " — " + (i ? copy.to : copy.from)}
            aria-invalid={!!filterError}
            aria-describedby={
              filterError ? "repricing-filter-error" : undefined
            }
            className={control}
            name={key}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={(i ? copy.to : copy.from) + "…"}
            value={f[key] ?? ""}
            onChange={(e) => setFilter(key, e.target.value)}
          />
        ))}
      </div>
    </fieldset>
  );
  return (
    <>
      <section
        className={panel + " p-5 space-y-4"}
        aria-labelledby="repricing-filters"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="repricing-filters" className="font-semibold">
            {copy.filters}{" "}
            <span className="ml-2 text-xs font-normal text-[var(--muted)]">
              {copy.active}: {activeRepricingFilters(f)}
            </span>
          </h2>
          <button
            type="button"
            className={button}
            onClick={() =>
              onChange({ ...draft, filters: defaultRepricingFilters() })
            }
          >
            {copy.reset}
          </button>
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
          <Choice
            label={copy.brand}
            value={f.brandId ?? ""}
            options={data?.filterOptions.brands ?? []}
            all={copy.allBrands}
            copy={copy}
            onChange={(v) => setFilter("brandId", v)}
          />
          <Choice
            label={copy.category}
            value={f.categoryId ?? ""}
            options={data?.filterOptions.categories ?? []}
            all={copy.allCategories}
            copy={copy}
            onChange={(v) => setFilter("categoryId", v)}
          />
          {range(copy.price, "priceMin", "priceMax")}
          {range(copy.stock, "stockMin", "stockMax")}
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
              placeholder="0…"
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
            <button
              className={button}
              type="button"
              onClick={() => setFilter("skuId", "")}
            >
              {copy.clearSku}
            </button>
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
      <section
        className={panel + " p-5 space-y-5"}
        aria-labelledby="repricing-parameters"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="repricing-parameters" className="font-semibold">
            {copy.parameters}
          </h2>
          <div
            role="group"
            aria-label={copy.quick}
            className="flex flex-wrap gap-1"
          >
            {Object.entries(REPRICING_PRESETS).map(([name, preset]) => (
              <button
                className={
                  button +
                  " aria-pressed:bg-[var(--input-bg)] aria-pressed:font-semibold"
                }
                type="button"
                key={name}
                aria-pressed={
                  p.minDiscountPct === preset.minDiscountPct &&
                  p.maxDiscountPct === preset.maxDiscountPct &&
                  p.sharePct === preset.sharePct
                }
                onClick={() =>
                  onChange({ ...draft, parameters: { ...p, ...preset } })
                }
              >
                {copy.presets[name as keyof typeof REPRICING_PRESETS]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {(
            [
              {
                key: "minDiscountPct",
                label: copy.minDiscount,
                min: 5,
                max: 35,
                step: 1,
              },
              {
                key: "maxDiscountPct",
                label: copy.maxDiscount,
                min: 20,
                max: 60,
                step: 1,
              },
              {
                key: "sharePct",
                label: copy.share,
                min: 10,
                max: 100,
                step: 5,
              },
            ] as const
          ).map((slider) => (
            <label key={slider.key} className="space-y-2 text-sm">
              <span>
                {slider.label}:{" "}
                <strong className="tabular-nums">{p[slider.key]}%</strong>
              </span>
              <input
                type="range"
                className="block w-full min-h-11 accent-[var(--text)] touch-pan-y"
                name={slider.key}
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={p[slider.key]}
                aria-invalid={!!parameterError}
                aria-describedby={
                  parameterError ? "repricing-parameter-error" : undefined
                }
                onChange={(e) =>
                  setParameter(slider.key, Number(e.target.value))
                }
              />
              <span className="flex justify-between text-xs text-[var(--muted)]">
                <span>{slider.min}%</span>
                <span>{slider.max}%</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label={copy.goal}>
            <select
              name="goal"
              className={control}
              value={p.goal}
              onChange={(e) => setParameter("goal", e.target.value)}
            >
              {Object.entries(copy.goals).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={copy.duration}>
            <select
              name="durationDays"
              className={control}
              value={p.durationDays}
              onChange={(e) =>
                setParameter("durationDays", Number(e.target.value))
              }
            >
              {[4, 10, 14].map((d) => (
                <option key={d} value={d}>
                  {d} {copy.days}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              className="size-5 accent-[var(--text)]"
              type="checkbox"
              name="costProtection"
              checked={p.costProtection}
              onChange={(e) =>
                onChange({
                  ...draft,
                  parameters: {
                    ...p,
                    costProtection: e.target.checked,
                    ...(e.target.checked
                      ? { liquidation: false, liquidationReason: null }
                      : {}),
                  },
                })
              }
            />
            {copy.protection}
          </label>
        </div>
        {!p.costProtection ? (
          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--text)]"
                name="liquidation"
                checked={p.liquidation}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    parameters: {
                      ...p,
                      liquidation: e.target.checked,
                      liquidationReason: e.target.checked
                        ? p.liquidationReason
                        : null,
                    },
                  })
                }
              />
              {copy.liquidation}
            </label>
            {p.liquidation ? (
              <Field label={copy.reason}>
                <textarea
                  className={control}
                  name="liquidationReason"
                  maxLength={500}
                  rows={2}
                  aria-invalid={!!parameterError}
                  value={p.liquidationReason ?? ""}
                  autoComplete="off"
                  placeholder={copy.reasonHint}
                  onChange={(e) =>
                    setParameter("liquidationReason", e.target.value)
                  }
                />
              </Field>
            ) : null}
            <Note>{copy.liquidationNote}</Note>
          </div>
        ) : null}
        {parameterError ? (
          <p id="repricing-parameter-error" role="alert" className="text-sm">
            {copy.parameterError}
          </p>
        ) : null}
        <p className="rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-3 text-xs leading-relaxed">
          {copy.rankingNote}
        </p>
        <Note>{copy.resetNote}</Note>
      </section>
    </>
  );
}
