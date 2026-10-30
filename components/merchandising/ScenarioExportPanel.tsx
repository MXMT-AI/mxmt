"use client";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {chatCopy} from "@/lib/merchandising-chat-copy";
import { panel, button, Note } from "./ReportPrimitives";
import { exportCopy, exportKindLabel } from "@/lib/scenario-export-client";
import type { ScenarioExportReceipt } from "@/lib/scenario-export-contract";
import type { useScenarioExport } from "./useScenarioExport";
import type { Lang } from "@/lib/translations";
function Files({
  receipt,
  lang,
}: {
  receipt: ScenarioExportReceipt;
  lang: Lang;
}) {
  const [page, setPage] = useState(1),
    copy = exportCopy[lang],
    pageSize = 10,
    pages = Math.ceil(receipt.files.length / pageSize);
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {receipt.files
          .slice((page - 1) * pageSize, page * pageSize)
          .map((file) => (
            <li key={file.id} className="min-w-0 text-sm">
              <a
                className="underline underline-offset-4 break-all focus-visible:outline-solid focus-visible:outline-2"
                href={file.url}
                download={file.name}
              >
                {copy.download}: {file.name}
              </a>
              <span className="ml-2 text-xs text-(--muted)">
                {file.rowCount} {copy.rows} · {file.currency}
              </span>
            </li>
          ))}
      </ul>
      {pages > 1 ? (
        <nav
          aria-label={copy.files}
          className="flex items-center gap-3 text-xs"
        >
          <button
            className={button}
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {copy.previous}
          </button>
          <span>
            {copy.page} {page} / {pages}
          </span>
          <button
            className={button}
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {copy.next}
          </button>
        </nav>
      ) : null}
    </div>
  );
}
/** Show prepared artifacts and their audit history without recomputing prices or exposing VIEWER download actions. */
export default function ScenarioExportPanel({
  state,
  previewId,
  allowed,
  lang,
}: {
  state: ReturnType<typeof useScenarioExport>;
  previewId: string | undefined;
  allowed: boolean;
  lang: Lang;
}) {
  const copy = exportCopy[lang],
    locale = lang === "uk" ? "uk-UA" : "en-GB",params=useSearchParams();
  const adviceHref=(receipt:ScenarioExportReceipt)=>{const q=new URLSearchParams(params);q.set("chat","1");q.set("chatTopic",receipt.kind==="reprice"?"repricing":"reordering");q.set("chatExportId",receipt.exportId);return `/overview?${q}`;};
  return (
    <section className={panel + " p-5 space-y-4"} aria-label={copy.history}>
      {!allowed ? <p className="text-sm">{copy.readOnly}</p> : null}
      <p role="status" aria-live="polite" className="text-sm">
        {state.busy
          ? copy.exporting
          : state.receipt
            ? state.receipt.previewId === previewId
              ? copy.prepared
              : copy.earlier
            : ""}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm">
          {state.error === "EXPORT_NOT_READY"
            ? copy.notReady
            : state.error === "EXPORT_PREVIEW_MISMATCH"
              ? copy.changed
              : state.error === "EXPORT_ID_CONFLICT"
                ? copy.conflict
                : state.error === "FORBIDDEN"
                  ? copy.readOnly
                  : copy.error}
        </p>
      ) : null}
      {allowed && state.receipt ? (
        <Files
          key={state.receipt.exportId}
          receipt={state.receipt}
          lang={lang}
        />
      ) : null}
      {allowed&&state.receipt&&state.receipt.previewId===previewId?<Link href={adviceHref(state.receipt)} className={button}>{chatCopy[lang].askScenario}</Link>:null}
      <Note>{copy.note}</Note>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          {copy.history}
        </summary>
        {state.historyError ? (
          <div role="alert">
            <p>{copy.historyError}</p>
            <button
              className={button}
              type="button"
              onClick={state.reloadHistory}
            >
              {copy.retry}
            </button>
          </div>
        ) : !state.history.length ? (
          <p className="text-sm">{copy.empty}</p>
        ) : (
          <ol className="space-y-4">
            {state.history.map((receipt) => (
              <li
                key={receipt.exportId}
                className="border-t border-(--border) pt-3 space-y-2"
              >
                <p className="text-sm">
                  {exportKindLabel(receipt.kind, lang)} ·{" "}
                  <time dateTime={receipt.createdAt}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(receipt.createdAt))}
                  </time>
                </p>
                <Note>
                  {copy.actor}: {receipt.actorId} · {copy.files}:{" "}
                  {receipt.files.length}
                </Note>
                {allowed ? <Files receipt={receipt} lang={lang} /> : null}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
