"use client";
import Link from "next/link";
import {
  createContext,
  useContext,
  useRef,
  useTransition,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { merchandisingCopy } from "@/lib/merchandising-copy";
import {
  applyMerchandisingFilters,
  readMerchandisingFilters,
  presetPeriod,
  type MerchandisingFilters,
  type PeriodMode,
} from "@/lib/merchandising-navigation";
import type { NavigationOptions } from "@/lib/merchandising-navigation-store";

const Options = createContext<NavigationOptions | null>(null);
const Filters = createContext<MerchandisingFilters | null>(null);
export const useMerchandisingFilters = () => useContext(Filters);
export const useMerchandisingOptions = () => useContext(Options);
const control =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] min-h-11 disabled:opacity-50 touch-manipulation";

/** URL state is shared across the screen family; invalid links never silently select different dates. */
export default function MerchandisingShell({
  options,
  now,
  children,
}: {
  options: NavigationOptions | null;
  now: string;
  children: ReactNode;
}) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const { lang } = useLang(),
    copy = merchandisingCopy[lang];
  let filters: MerchandisingFilters | null = null;
  try {
    filters = readMerchandisingFilters(
      new URLSearchParams(params),
      new Date(now),
    );
  } catch {
    /* Show a recoverable invalid-link state. */
  }
  return (
    <Options.Provider value={options}>
      <Filters.Provider value={filters}>
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
          {!options ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3"
            >
              <p>{copy.error}</p>
              <button
                type="button"
                className={control}
                onClick={() => router.refresh()}
              >
                {copy.retry}
              </button>
            </div>
          ) : !filters ? (
            <div
              role="alert"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3"
            >
              <p>{copy.invalidLink}</p>
              <Link className={control + " inline-block"} href={pathname}>
                {copy.reset}
              </Link>
            </div>
          ) : (
            <>
              <FilterForm
                key={params.toString()}
                filters={filters}
                now={now}
                options={options}
              />
              {children}
            </>
          )}
        </div>
      </Filters.Provider>
    </Options.Provider>
  );
}

/** Apply one validated filter draft in a single URL navigation, including browser history. */
function FilterForm({
  filters,
  options,
  now,
}: {
  filters: MerchandisingFilters;
  options: NavigationOptions;
  now: string;
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
      const dates =
        draft.period === "custom"
          ? draft
          : (() => {
              const period = presetPeriod(draft.period, anchor, new Date(now));
              return { ...draft, dateFrom: period.from, dateTo: period.to };
            })();
      // An invalid existing URL is handled by the parent and cannot reach this form.
      const next = applyMerchandisingFilters(
        new URLSearchParams(params),
        dates,
        new Date(now),
      );
      setError(false);
      startTransition(() =>
        router.push(`${pathname}?${next}`, { scroll: false }),
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
      className="mb-8 border-b border-[var(--border)] pb-5"
    >
      <form
        onSubmit={apply}
        aria-busy={pending}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {copy.period}
          <select
            name="period"
            className={control}
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
        </label>
        {draft.period === "custom" ? (
          <>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              {copy.from}
              <input
                type="date"
                name="dateFrom"
                required
                min="2000-01-01"
                className={control}
                value={draft.dateFrom}
                onChange={(e) =>
                  setDraft({ ...draft, dateFrom: e.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              {copy.to}
              <input
                type="date"
                name="dateTo"
                required
                min={draft.dateFrom}
                className={control}
                value={draft.dateTo}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {copy.anchor}
            <input
              type="date"
              name="periodAnchor"
              required
              min="2000-01-01"
              className={control}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          {copy.channel}
          <select
            name="channelId"
            value={draft.channelId}
            className={control}
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
        </label>
        <button
          type="submit"
          disabled={pending}
          className={control + " font-medium hover:bg-[var(--input-bg)]"}
        >
          {pending ? copy.loading : copy.apply}
        </button>
      </form>
      <p
        className="mt-3 text-sm tabular-nums text-[var(--text)]"
        aria-live="polite"
      >
        {date(filters.dateFrom)} – {date(filters.dateTo)}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">{copy.stockScope}</p>
      {options.channels.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {copy.noChannels}{" "}
          <Link className="underline" href={`/settings?${params}`}>
            {copy.settings}
          </Link>
        </p>
      ) : null}
      {options.truncated ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {copy.limitedChannels}
        </p>
      ) : null}
      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mt-3 text-sm font-medium text-[var(--text)]"
        >
          {copy.invalid}
        </p>
      ) : null}
    </section>
  );
}
