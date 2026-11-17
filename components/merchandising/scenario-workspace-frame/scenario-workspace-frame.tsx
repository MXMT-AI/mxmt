import type { ComponentProps, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useLang } from "@/components/language-provider/language-provider";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import type { Lang } from "@/lib/translations";
import { useMerchandisingFilters } from "../merchandising-shell/merchandising-shell";
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
  const ready = !busy && !error ? data : null;

  return (
    <div className="space-y-5">
      {ready ? <ReportReadiness data={ready.readiness} lang={lang} /> : null}
      <ScenarioWorkspaceHeader
        backHref={merchandisingHref("/overview", new URLSearchParams(params))}
        copy={copy}
        busy={busy}
        onRefresh={refresh}
      />
      {error ? (
        <ReportingError code={error} lang={lang} onRetry={refresh} />
      ) : ready ? (
        children({
          snapshotId: ready.context.snapshotId,
          asOf: ready.context.asOf,
          monobrand: ready.context.profileMode === "MONOBRAND",
          lang,
          onRefresh: refresh,
        })
      ) : (
        <p role="status">{copy.loading}</p>
      )}
    </div>
  );
}
