"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { useMerchandisingFilters } from "@/components/merchandising/MerchandisingShell";
import { useMerchandisingScreen } from "@/components/merchandising/useMerchandisingScreen";
import { button } from "@/components/merchandising/ReportPrimitives";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { repricingCopy } from "@/lib/repricing-copy";
import RepricingEditor from "./RepricingEditor";
export default function RepricingWorkspace() {
  const filters = useMerchandisingFilters()!,
    params = useSearchParams(),
    { lang } = useLang(),
    copy = repricingCopy[lang];
  const { data, busy, error, refresh } = useMerchandisingScreen(
    filters,
    "repricing",
  );
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <Link
            className="text-sm text-[var(--muted)] underline underline-offset-4"
            href={merchandisingHref("/overview", new URLSearchParams(params))}
          >
            {copy.back}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{copy.intro}</p>
        </div>
        <button
          className={button}
          type="button"
          onClick={refresh}
          disabled={busy}
        >
          {copy.refresh}
        </button>
      </header>
      {error ? (
        <div role="alert" className="space-y-3">
          <p>{copy.error}</p>
          <button className={button} type="button" onClick={refresh}>
            {copy.retry}
          </button>
        </div>
      ) : busy || !data ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <RepricingEditor
          key={data.context.snapshotId}
          snapshotId={data.context.snapshotId}
          lang={lang}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
