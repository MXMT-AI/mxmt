"use client";
import ReportingError from "@/components/merchandising/ReportingError";
import ReportReadiness from "@/components/merchandising/ReportReadiness";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/LanguageProvider";
import { useMerchandisingFilters } from "@/components/merchandising/MerchandisingShell";
import { useMerchandisingScreen } from "@/components/merchandising/useMerchandisingScreen";
import { button } from "@/components/merchandising/ReportPrimitives";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { reorderingCopy } from "@/lib/reordering-copy";
import ReorderingEditor from "./ReorderingEditor";
export default function ReorderingWorkspace() {
  const filters = useMerchandisingFilters()!,
    params = useSearchParams(),
    { lang } = useLang(),
    copy = reorderingCopy[lang];
  const { data, busy, error, refresh } = useMerchandisingScreen(
    filters,
    "reordering",
  );
  return (
    <div className="space-y-5">
      {data && !busy && !error ? <ReportReadiness data={data.readiness} lang={lang}/> : null}
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <Link
            className="text-sm text-(--muted) underline underline-offset-4"
            href={merchandisingHref("/overview", new URLSearchParams(params))}
          >
            {copy.back}
          </Link>
          <h1 className="mt-3 text-2xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-(--muted)">{copy.intro}</p>
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
        <ReportingError code={error} lang={lang} onRetry={refresh}/>
      ) : busy || !data ? (
        <p role="status">{copy.loading}</p>
      ) : (
        <ReorderingEditor
          key={data.context.snapshotId}
          snapshotId={data.context.snapshotId}
          asOf={data.context.asOf}
          monobrand={data.context.profileMode === "MONOBRAND"}
          lang={lang}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}
