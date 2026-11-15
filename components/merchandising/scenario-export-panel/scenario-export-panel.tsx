"use client";

import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { chatCopy } from "@/lib/merchandising-chat-copy";
import { panel } from "@/components/ui/panel/panel-styles";
import { button } from "@/components/ui/button/button-styles";
import { Note } from "@/components/ui/note/note";
import { exportCopy } from "@/lib/scenario-export-client";
import type { ScenarioExportReceipt } from "@/lib/scenario-export-contract";
import type { useScenarioExport } from "../use-scenario-export";
import type { Lang } from "@/lib/translations";
import { ExportFiles } from "../export-files/export-files";
import { ExportHistory } from "../export-history/export-history";

const errorCopyKeys: Record<string, keyof typeof exportCopy.en> = {
  EXPORT_NOT_READY: "notReady",
  EXPORT_PREVIEW_MISMATCH: "changed",
  EXPORT_ID_CONFLICT: "conflict",
  FORBIDDEN: "readOnly",
};

export default function ScenarioExportPanel({ state, previewId, allowed, lang }: {
  state: ReturnType<typeof useScenarioExport>;
  previewId: string | undefined;
  allowed: boolean;
  lang: Lang;
}) {
  const copy = exportCopy[lang];
  const params = useSearchParams();
  const errorKey = Object.hasOwn(errorCopyKeys, state.error) ? errorCopyKeys[state.error] : "error";

  function adviceHref(receipt: ScenarioExportReceipt) {
    const query = new URLSearchParams(params);
    query.set("chat", "1");
    query.set("chatTopic", receipt.kind === "reprice" ? "repricing" : "reordering");
    query.set("chatExportId", receipt.exportId);
    return `/overview?${query}`;
  }

  return (
    <section className={panel + " p-5 space-y-4"} aria-label={copy.history}>
      {!allowed ? <p className="text-sm">{copy.readOnly}</p> : null}
      <p role="status" aria-live="polite" className="text-sm">
        {state.busy
          ? copy.exporting
          : state.receipt
            ? state.receipt.previewId === previewId ? copy.prepared : copy.earlier
            : ""}
      </p>
      {state.error ? <p role="alert" className="text-sm">{copy[errorKey]}</p> : null}
      {allowed && state.receipt ? <ExportFiles key={state.receipt.exportId} receipt={state.receipt} lang={lang} /> : null}
      {allowed && state.receipt && state.receipt.previewId === previewId ? (
        <Link href={adviceHref(state.receipt)} className={button}>{chatCopy[lang].askScenario}</Link>
      ) : null}
      <Note>{copy.note}</Note>
      <ExportHistory history={state.history} error={state.historyError} onRetry={state.reloadHistory} allowed={allowed} lang={lang} />
    </section>
  );
}
