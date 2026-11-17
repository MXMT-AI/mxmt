"use client";
import { Heading } from "@/components/ui/heading/heading";
import { panel } from "@/components/ui/panel/panel-styles";
import { Button } from "@/components/ui/button/button";
import { Note } from "@/components/ui/note/note";
import { Choice } from "@/components/ui/choice/choice";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { ReorderingDraft } from "@/lib/reordering-workspace";
import type { ReorderingCopy } from "@/lib/reordering-copy";
import type { ScenarioFailure } from "@/lib/client/scenario-preview-request";
import type { ReorderingPreview } from "../reordering-editor/reordering-editor";
const parameterFields = [
  { key: "leadDays", labelKey: "lead" },
  { key: "coverDays", labelKey: "cover" },
] as const;

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
  const parameterErrors = error?.details.filter((detail) =>
    detail.startsWith("parameters."),
  ) ?? [];

  return (
    <section
      className={panel + " p-5 space-y-4"}
      aria-labelledby="reordering-controls"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading as="h2" variant="compact" className="text-base text-inherit" id="reordering-controls">
          {copy.mode}
        </Heading>
        <Button variant="report" onClick={onReset}>
          {copy.reset}
        </Button>
      </div>
      <div role="group" aria-label={copy.mode} className="flex flex-wrap gap-2">
        {(["shortage", monobrand ? "all" : "brand"] as const).map((mode) => (
          <Button
            variant="report"
            className="aria-pressed:bg-(--input-bg) aria-pressed:font-semibold"
            key={mode}
            aria-pressed={draft.mode === mode}
            onClick={() => onChange({ ...draft, mode })}
          >
            {copy.modes[mode]}
          </Button>
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
        {parameterFields.map(({ key, labelKey }) => {
          const invalid = parameterErrors.some((detail) =>
            detail.startsWith("parameters." + key),
          );
          return (
            <Field key={key} label={copy[labelKey]}>
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
      <Note id="reordering-settings-note" className="leading-4">
        {copy.inherit}
      </Note>
      {parameterErrors.length > 0 ? (
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
          <Button
            variant="report"
            onClick={() => {
              const filters = { ...draft.filters };
              for (const key of context) delete filters[key];
              onChange({ ...draft, filters });
            }}
          >
            {copy.clearContext}
          </Button>
        </div>
      ) : null}
      <Note>{monobrand ? copy.scopeNoteMono : copy.scopeNote}</Note>
    </section>
  );
}
