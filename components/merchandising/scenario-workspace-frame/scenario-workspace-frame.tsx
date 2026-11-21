import { useState, type ComponentProps, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import type { Lang } from "@/lib/translations";
import { useMerchandisingFilters } from "../merchandising-shell/merchandising-shell";
import { PublishedReportStatus } from "../published-report-status/published-report-status";
import ReportReadiness from "../report-readiness/report-readiness";
import ReportingError from "../reporting-error/reporting-error";
import { ScenarioWorkspaceHeader } from "../scenario-workspace-header/scenario-workspace-header";
import { useMerchandisingScreen } from "../use-merchandising-screen";

type ScenarioCopy = ComponentProps<typeof ScenarioWorkspaceHeader>["copy"] & { loading: string };

export function ScenarioWorkspaceFrame({ screen, translations, children }: {
  screen: "repricing" | "reordering";
  translations: Record<Lang, ScenarioCopy>;
  children: (context: {
    snapshotId: string;
    published: boolean;
    asOf: string;
    monobrand: boolean;
    lang: Lang;
    onRefresh: () => void;
  }) => ReactNode;
}) {
  const filters = useMerchandisingFilters()!;
  const params = useSearchParams();
  const { lang } = useLang();
  const copy = translations[lang];
  const { data, busy, error, refresh } = useMerchandisingScreen(filters, screen);
  const [lastPublished, setLastPublished] = useState(data?.publishedAt ? data : null);
  if (data?.publishedAt && data !== lastPublished) setLastPublished(data);
  const ready = data?.publishedAt || (!busy && !error)
    ? data
    : null;
  const editor = ready ?? (!data ? lastPublished : null);

  return (
    <div className="space-y-5">
      {ready?.publishedAt ? <PublishedReportStatus publishedAt={ready.publishedAt} busy={busy} lang={lang} /> : null}
      {ready ? <ReportReadiness data={ready.readiness} lang={lang} /> : null}
      <ScenarioWorkspaceHeader
        backHref={merchandisingHref("/overview", new URLSearchParams(params))}
        copy={copy}
        busy={busy}
        onRefresh={refresh}
      />
      {error ? <ReportingError code={error} lang={lang} onRetry={refresh} /> : null}
      {editor ? (
        children({
          snapshotId: editor.context.snapshotId,
          published: Boolean(editor.publishedAt),
          asOf: editor.context.asOf,
          monobrand: editor.context.profileMode === "MONOBRAND",
          lang,
          onRefresh: refresh,
        })
      ) : !error ? (
        <p role="status">{copy.loading}</p>
      ) : null}
    </div>
  );
}
