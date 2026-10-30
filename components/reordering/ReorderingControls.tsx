"use client";
import {
  panel,
  button,
  Note,
} from "@/components/merchandising/ReportPrimitives";
import {
  Choice,
  Field,
  control,
} from "@/components/merchandising/FormControls";
import type { ReorderingDraft } from "@/lib/reordering-workspace";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ScenarioFailure } from "@/components/merchandising/useScenarioPreview";
import type { ReorderingPreview } from "./ReorderingEditor";
/** Empty term controls inherit supplier policy instead of overriding it with a global default. */
export default function ReorderingControls({
  monobrand = false,
  draft,
  data,
  error,
  copy,
  onChange,
  onReset,
}: {
  monobrand?: boolean;
  draft: ReorderingDraft;
  data: ReorderingPreview | null;
  error: ScenarioFailure | null;
  copy: ReorderingCopy;
  onChange: (draft: ReorderingDraft) => void;
  onReset: () => void;
}) {
  const setFilter = (key: "brandId" | "supplierId", value: string) => {
    const filters = { ...draft.filters };
    if (value) filters[key] = value;
    else delete filters[key];
    onChange({ ...draft, filters });
  };
  const context = (["categoryId", "skuId", "currency"] as const).filter(
    (key) => draft.filters[key] !== undefined,
  );
  return (
    <section
      className={panel + " p-5 space-y-4"}
      aria-labelledby="reordering-controls"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold" id="reordering-controls">
          {copy.mode}
        </h2>
        <button type="button" className={button} onClick={onReset}>
          {copy.reset}
        </button>
      </div>
      <div role="group" aria-label={copy.mode} className="flex flex-wrap gap-2">
        {(["shortage", monobrand ? "all" : "brand"] as const).map((mode) => (
          <button
            className={
              button +
              " aria-pressed:bg-(--input-bg) aria-pressed:font-semibold"
            }
            type="button"
            key={mode}
            aria-pressed={draft.mode === mode}
            onClick={() => onChange({ ...draft, mode })}
          >
            {copy.modes[mode]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!monobrand && (
          <Choice
            label={copy.brand}
            value={draft.filters.brandId ?? ""}
            options={data?.filterOptions.brands ?? []}
            all={copy.allBrands}
            copy={copy}
            onChange={(value) => setFilter("brandId", value)}
          />
        )}
        <Choice
          label={copy.supplier}
          value={draft.filters.supplierId ?? ""}
          options={data?.filterOptions.suppliers ?? []}
          all={copy.allSuppliers}
          copy={copy}
          onChange={(value) => setFilter("supplierId", value)}
        />
        {(["leadDays", "coverDays"] as const).map((key) => {
          const invalid = error?.details.some((d) =>
            d.startsWith("parameters." + key),
          );
          return (
            <Field
              key={key}
              label={key === "leadDays" ? copy.lead : copy.cover}
            >
              <input
                className={control}
                name={key}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draft[key]}
                aria-invalid={!!invalid}
                aria-describedby={
                  invalid
                    ? "reordering-field-error"
                    : "reordering-settings-note"
                }
                placeholder={`${copy.settings}${data ? ` (${data.defaults.clientPolicy[key]})` : ""}…`}
                onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
              />
            </Field>
          );
        })}
      </div>
      <p id="reordering-settings-note" className="text-xs text-(--muted)">
        {copy.inherit}
      </p>
      {error?.details.some((d) => d.startsWith("parameters.")) ? (
        <p id="reordering-field-error" role="alert" className="text-sm">
          {copy.invalid}
        </p>
      ) : null}
      {context.length ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>{copy.context}:</span>
          {context.map((key) => (
            <span translate="no" className="break-all" key={key}>
              {draft.filters[key]}
            </span>
          ))}
          <button
            type="button"
            className={button}
            onClick={() => {
              const filters = { ...draft.filters };
              for (const key of context) delete filters[key];
              onChange({ ...draft, filters });
            }}
          >
            {copy.clearContext}
          </button>
        </div>
      ) : null}
      <Note>{monobrand ? copy.scopeNoteMono : copy.scopeNote}</Note>
    </section>
  );
}
