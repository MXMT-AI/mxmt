"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { useMerchandisingFilters } from "@/components/merchandising/MerchandisingShell";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { overviewCopy } from "@/lib/overview-copy";
import { useOverview } from "./useOverview";
import OverviewContent from "./OverviewContent";
/** Existing auth-aware API wrapper and shared URL filters drive one published Overview. */
export default function OverviewWorkspace() {
  const filters = useMerchandisingFilters()!;
  const { lang } = useLang(),
    copy = overviewCopy[lang],
    params = useSearchParams();
  const { data, busy, error, refresh } = useOverview(filters);
  if (error)
    return (
      <div
        role="alert"
        className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>
          {error === "SCREEN_SELECTION_MISMATCH" ? copy.mismatch : copy.error}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={refresh}
            className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 hover:bg-[var(--input-bg)]"
          >
            {copy.refresh}
          </button>
          <Link
            href={merchandisingHref("/settings", new URLSearchParams(params))}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {copy.settings}
          </Link>
        </div>
      </div>
    );
  if (busy || !data)
    return (
      <div role="status" aria-live="polite" className="py-6">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{copy.loading}</p>
      </div>
    );
  return (
    <OverviewContent
      data={data}
      lang={lang}
      query={params.toString()}
      monobrand={data.context.profileMode === "MONOBRAND"}
      onRefresh={refresh}
    />
  );
}
