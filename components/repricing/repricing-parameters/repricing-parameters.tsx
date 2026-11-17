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
import { REPRICING_PRESETS, type RepricingParameters as ParameterValues } from "@/lib/repricing-contract";
import { RepricingPercentageField } from "../repricing-percentage-field/repricing-percentage-field";

const percentageFields = [
  { key: "minDiscountPct", labelKey: "minDiscount", min: 5, max: 35, step: 1 },
  { key: "maxDiscountPct", labelKey: "maxDiscount", min: 20, max: 60, step: 1 },
  { key: "sharePct", labelKey: "share", min: 10, max: 100, step: 5 },
] as const;

export function RepricingParameters({ draft, onChange, error, copy }: {
  draft: RepricingDraft;
  onChange: (draft: RepricingDraft) => void;
  error: RepricingFailure | null;
  copy: RepricingCopy;
}) {
  const p = draft.parameters;
  const setParameter = (key: keyof ParameterValues, value: unknown) =>
    onChange({ ...draft, parameters: { ...p, [key]: value } });
  const parameterError = error?.details.some(detail => detail.startsWith("parameters."));
  return (
    <section
      className={panel + " p-5 space-y-5"}
      aria-labelledby="repricing-parameters"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading as="h2" variant="compact" id="repricing-parameters" className="text-base text-inherit">
          {copy.parameters}
        </Heading>
        <div
          role="group"
          aria-label={copy.quick}
          className="flex flex-wrap gap-1"
        >
          {Object.entries(REPRICING_PRESETS).map(([name, preset]) => (
            <Button
              variant="report"
              className="aria-pressed:bg-(--input-bg) aria-pressed:font-semibold"
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
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {percentageFields.map(({ key, labelKey, ...limits }) => (
          <RepricingPercentageField
            key={key}
            name={key}
            label={copy[labelKey]}
            {...limits}
            value={p[key]}
            invalid={!!parameterError}
            describedBy={parameterError ? "repricing-parameter-error" : undefined}
            onChange={value => setParameter(key, value)}
          />
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
            className="size-5 accent-(--text)"
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
        <div className="space-y-3 border-t border-(--border) pt-4">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-(--text)"
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
      <p className="rounded-lg border border-(--border) bg-(--input-bg) p-3 text-xs leading-relaxed">
        {copy.rankingNote}
      </p>
      <Note>{copy.resetNote}</Note>
    </section>
  );
}
