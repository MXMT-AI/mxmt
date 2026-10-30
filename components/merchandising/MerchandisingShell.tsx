"use client";
import ReportingSourceStatus from "./ReportingSourceStatus";
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
  applyMerchandisingSelection,
  readMerchandisingFilters,
  type MerchandisingFilters,
  type PeriodMode,
} from "@/lib/merchandising-navigation";
import type { NavigationOptions } from "@/lib/merchandising-navigation-store";

const Options = createContext<NavigationOptions | null>(null);
const ExportPermission = createContext(false);
export const useScenarioExportPermission = () => useContext(ExportPermission);
const Filters = createContext<MerchandisingFilters | null>(null);
export const useMerchandisingFilters = () => useContext(Filters);
export const useMerchandisingOptions = () => useContext(Options);
const control =
  "rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text) min-h-11 disabled:opacity-50 touch-manipulation";

/** URL state is shared across the screen family; invalid links never silently select different dates. */
export default function MerchandisingShell({
  options,
  now,
  children,
  exportAllowed = false,
}: {
  exportAllowed?: boolean;
  options: NavigationOptions | null;
  now: string;
  children: ReactNode;
}) {
  const params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const { lang } = useLang(),
    copy = merchandisingCopy[lang];
  const [appliedAt, setAppliedAt] = useState<string | null>(null);
  // Initial rendering uses the server clock for hydration. Apply advances it so
  // a new URL is not rejected by the persistent layout's older timestamp.
  const readingClock = new Date(
    Math.max(Date.parse(now), Date.parse(appliedAt ?? now)),
  );
  let filters: MerchandisingFilters | null = null;
  try {
    filters = readMerchandisingFilters(
      new URLSearchParams(params),
      readingClock,
    );
  } catch {
    /* Show a recoverable invalid-link state. */
  }
  return (
    <ExportPermission.Provider value={exportAllowed}>
      <Options.Provider value={options}>
        <Filters.Provider value={filters}>
          <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
            {!options ? (
              <div
                role="alert"
                className="rounded-lg border border-(--border) bg-(--surface) p-5 space-y-3"
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
                className="rounded-lg border border-(--border) bg-(--surface) p-5 space-y-3"
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
                  onApply={setAppliedAt}
                  options={options}
                />
                <ReportingSourceStatus compact/>
                {children}
              </>
            )}
          </div>
        </Filters.Provider>
      </Options.Provider>
    </ExportPermission.Provider>
  );
}

/** Apply one validated filter draft in a single URL navigation, including browser history. */
function FilterForm({
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
        <label className="flex flex-col gap-1 text-xs text-(--muted)">
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
            <label className="flex flex-col gap-1 text-xs text-(--muted)">
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
            <label className="flex flex-col gap-1 text-xs text-(--muted)">
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
          <label className="flex flex-col gap-1 text-xs text-(--muted)">
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
        <label className="flex flex-col gap-1 text-xs text-(--muted)">
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
          className={control + " font-medium hover:bg-(--input-bg)"}
        >
          {pending ? copy.loading : copy.apply}
        </button>
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
