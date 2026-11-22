"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/fetch";
import { readApiJson } from "@/lib/api-response";
import { reportingErrorHelp } from "@/lib/reporting-readiness-copy";
import { merchandisingCopy } from "@/lib/merchandising-copy";
import { applyMerchandisingSelection, type MerchandisingFilters, type PeriodMode } from "@/lib/merchandising-navigation";
import type { NavigationOptions } from "@/lib/merchandising-navigation-store";
import { merchandisingMerchandisingFiltersFormMessages as englishCopy } from "@/messages/en.json";
import { merchandisingMerchandisingFiltersFormMessages as ukrainianCopy } from "@/messages/uk.json";

const fieldControl = cn(control, "w-auto min-w-auto touch-manipulation");

export function MerchandisingFiltersForm({
  filters,
  options,
  onApply,
  publishAllowed = false,
  savedSnapshotId,
  savedAsOf,
}: {
  filters: MerchandisingFilters;
  options: NavigationOptions;
  onApply: (appliedAt: string) => void;
  publishAllowed?: boolean;
  savedSnapshotId?: string;
  savedAsOf?: string;
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
  const [publishing, setPublishing] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const publicationRequest = useRef<AbortController | null>(null);
  useEffect(() => () => publicationRequest.current?.abort(), []);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectedUnknown =
    draft.channelId && !options.channels.some((c) => c.id === draft.channelId);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || publicationRequest.current) return;
    const publish = publishAllowed &&
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "publishSnapshot";
    try {
      const selection = applyMerchandisingSelection(
        new URLSearchParams(params),
        draft,
        anchor,
      );
      setError(false);
      setPublicationError("");
      if (publish) {
        void publishSelection(selection);
        return;
      }
      if (savedSnapshotId) {
        selection.query.set("period", filters.period);
        selection.query.set("dateFrom", filters.dateFrom);
        selection.query.set("dateTo", filters.dateTo);
        selection.query.set("snapshotId", savedSnapshotId);
        if (savedAsOf) selection.query.set("asOf", savedAsOf);
      }
      onApply(selection.appliedAt);
      startTransition(() =>
        router.push(`${pathname}?${selection.query}`, { scroll: false }),
      );
    } catch {
      setError(true);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }
  async function publishSelection(selection: ReturnType<typeof applyMerchandisingSelection>) {
    const controller = new AbortController();
    publicationRequest.current = controller;
    setPublishing(true);
    try {
      const response = await apiFetch("/api/merchandising/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publish: true,
          dateFrom: selection.query.get("dateFrom"),
          dateTo: selection.query.get("dateTo"),
        }),
        signal: controller.signal,
      });
      const result = await readApiJson<{ snapshotId?: string; asOf?: string; code?: string }>(response);
      if (!response.ok || !result.snapshotId || !result.asOf)
        throw new Error(result.code ?? "SCREEN_DATA_UNAVAILABLE");
      if (controller.signal.aborted) return;
      selection.query.set("snapshotId", result.snapshotId);
      selection.query.set("asOf", result.asOf);
      onApply(selection.appliedAt);
      startTransition(() => {
        router.push(`${pathname}?${selection.query}`, { scroll: false });
        router.refresh();
      });
    } catch (error) {
      if (!controller.signal.aborted)
        setPublicationError(error instanceof Error ? error.message : "SCREEN_DATA_UNAVAILABLE");
    } finally {
      publicationRequest.current = null;
      if (!controller.signal.aborted) setPublishing(false);
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
        aria-busy={pending || publishing}
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
                    ? ukrainianCopy.unassignedChannel
                    : englishCopy.unassignedChannel
                  : channel.id}
              </option>
            ))}
          </select>
        </Field>
        <Button
          variant="report"
          type="submit"
          disabled={pending || publishing}
          className="border-(--action-border) bg-(--action-bg) font-semibold text-(--action-ink) hover:bg-(--action-hover) hover:text-(--action-ink)"
        >
          {pending ? copy.loading : copy.apply}
        </Button>
        {publishAllowed ? (
          <Button variant="report" type="submit" name="publishSnapshot" disabled={pending || publishing}>
            {copy.publish}
          </Button>
        ) : null}
      </form>
      {savedSnapshotId && publishAllowed ? (
        <p className="mt-2 text-sm text-(--muted)">{copy.savedPeriodHint}</p>
      ) : null}
      {publishAllowed ? (
        <p role="status" className="mt-2 text-sm text-(--muted) empty:sr-only">
          {publishing ? copy.publishing : null}
        </p>
      ) : null}
      {publicationError ? (
        <p role="alert" className="mt-2 text-sm font-medium">
          {reportingErrorHelp(publicationError, lang).message}
        </p>
      ) : null}
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
