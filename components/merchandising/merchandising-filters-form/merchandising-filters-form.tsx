"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import { merchandisingCopy } from "@/lib/merchandising-copy";
import { applyMerchandisingSelection, type MerchandisingFilters, type PeriodMode } from "@/lib/merchandising-navigation";
import type { NavigationOptions } from "@/lib/merchandising-navigation-store";

const fieldControl = cn(control, "w-auto min-w-auto touch-manipulation");

export function MerchandisingFiltersForm({
  filters,
  options,
  onApply,
}: {
  filters: MerchandisingFilters;
  options: NavigationOptions;
  onApply: (appliedAt: string) => void;
}) {
  const { lang } = useLang(),
    copy = merchandisingCopy[lang];
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [draft, setDraft] = useState(filters),
    [anchor, setAnchor] = useState(filters.dateFrom),
    [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectedUnknown =
    draft.channelId && !options.channels.some((c) => c.id === draft.channelId);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const selection = applyMerchandisingSelection(
        new URLSearchParams(params),
        draft,
        anchor,
      );
      setError(false);
      onApply(selection.appliedAt);
      startTransition(() =>
        router.push(`${pathname}?${selection.query}`, { scroll: false }),
      );
    } catch {
      setError(true);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  const locale = lang === "uk" ? "uk-UA" : "en-GB";
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  return (
    <section
      aria-label={copy.filters}
      className="mb-8 border-b border-(--border) pb-5"
    >
      <form
        onSubmit={apply}
        aria-busy={pending}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label={copy.period} className="min-w-auto gap-1">
          <select
            name="period"
            className={fieldControl}
            value={draft.period}
            onChange={(e) =>
              setDraft({ ...draft, period: e.target.value as PeriodMode })
            }
          >
            {(["month", "quarter", "year", "custom"] as const).map((mode) => (
              <option key={mode} value={mode}>
                {copy[mode]}
              </option>
            ))}
          </select>
        </Field>
        {draft.period === "custom" ? (
          <>
            <Field label={copy.from} className="min-w-auto gap-1">
              <input
                type="date"
                name="dateFrom"
                required
                min="2000-01-01"
                className={fieldControl}
                value={draft.dateFrom}
                onChange={(e) =>
                  setDraft({ ...draft, dateFrom: e.target.value })
                }
              />
            </Field>
            <Field label={copy.to} className="min-w-auto gap-1">
              <input
                type="date"
                name="dateTo"
                required
                min={draft.dateFrom}
                className={fieldControl}
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              />
            </Field>
          </>
        ) : (
          <Field label={copy.anchor} className="min-w-auto gap-1">
            <input
              type="date"
              name="periodAnchor"
              required
              min="2000-01-01"
              className={fieldControl}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
          </Field>
        )}
        <Field label={copy.channel} className="min-w-auto gap-1">
          <select
            name="channelId"
            value={draft.channelId}
            className={fieldControl}
            onChange={(e) => setDraft({ ...draft, channelId: e.target.value })}
          >
            <option value="">{copy.allChannels}</option>
            {selectedUnknown ? (
              <option value={draft.channelId}>
                {copy.selectedChannel}: {draft.channelId}
              </option>
            ) : null}
            {options.channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.id === "__unassigned__"
                  ? lang === "uk"
                    ? "Канал не вказано"
                    : "Unassigned channel"
                  : channel.id}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="report"
          type="submit"
          disabled={pending}
          className="border-(--action-border) bg-(--action-bg) font-semibold text-(--action-ink) hover:bg-(--action-hover) hover:text-(--action-ink)"
        >
          {pending ? copy.loading : copy.apply}
        </Button>
      </form>
      <p
        className="mt-3 text-sm tabular-nums text-(--text)"
        aria-live="polite"
      >
        {date(filters.dateFrom)} – {date(filters.dateTo)}
      </p>
      <p className="mt-1 text-xs text-(--muted)">{copy.stockScope}</p>
      {options.channels.length === 0 ? (
        <p className="mt-2 text-xs text-(--muted)">
          {copy.noChannels}{" "}
          <Link className="underline" href={`/settings?${params}`}>
            {copy.settings}
          </Link>
        </p>
      ) : null}
      {options.truncated ? (
        <p className="mt-2 text-xs text-(--muted)">
          {copy.limitedChannels}
        </p>
      ) : null}
      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-3 text-sm font-medium text-(--text)"
        >
          {copy.invalid}
        </p>
      ) : null}
    </section>
  );
}
