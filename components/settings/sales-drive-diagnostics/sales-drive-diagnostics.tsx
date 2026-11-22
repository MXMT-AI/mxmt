import { Note } from "@/components/ui/note/note";
import { connectorCheckLabels } from "@/lib/connectors/check-copy";
import type { ConnectionCheck } from "@/lib/connectors/contract";
import type { Lang } from "@/lib/translations";
import { diagnosticsCopy } from "../connector-diagnostics/copy";
import { formatMessage } from "@/i18n/format-message";
import { settingsSalesDriveDiagnosticsMessages as englishCopy } from "@/messages/en.json";
import { settingsSalesDriveDiagnosticsMessages as ukrainianCopy } from "@/messages/uk.json";

const previewLimit = 50;

export function SalesDriveDiagnostics({ check, lang }: { check: ConnectionCheck | null; lang: Lang }) {
  if (!check) return null;
  const uk = lang === "uk";
  const codes = connectorCheckLabels(lang);
  const labels: Record<string, string> = {
    ...diagnosticsCopy[lang].resources,
    receipts: uk ? ukrainianCopy.receipts : englishCopy.receipts,
    catalog: uk ? ukrainianCopy.catalogProductsAndStock : englishCopy.catalogProductsAndStock,
  };
  return (
    <div className="space-y-3">
      <Note className="leading-normal">
        {uk ? ukrainianCopy.checked : englishCopy.checked}
        {new Intl.DateTimeFormat(uk ? "uk-UA" : "en-GB", {
          timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short",
        }).format(new Date(check.checkedAt))}
      </Note>
      <dl className="space-y-2 text-sm">
        {check.checks.map(result => (
          <div key={result.resource} className="flex flex-wrap justify-between gap-2">
            <dt className="text-(--text)">{labels[result.resource] ?? result.resource}</dt>
            <dd className={result.code === "OK" ? "font-medium text-(--text)" : "text-(--muted)"}>{codes[result.code] ?? result.code}</dd>
          </div>
        ))}
      </dl>
      {(["statuses", "channels"] as const).map(key => {
        const dictionary = check[key];
        return (
          <details key={key} className="border-t border-(--border) pt-3">
            <summary className="cursor-pointer text-sm text-(--text)">
              {labels[key]} ({new Intl.NumberFormat(lang).format(dictionary.entries.length)})
            </summary>
            {!dictionary.complete && <Note className="mt-2 leading-normal">{uk ? ukrainianCopy.theDictionaryIsIncompleteOr : englishCopy.theDictionaryIsIncompleteOr}</Note>}
            <ul className="mt-2 max-h-56 overflow-auto text-sm text-(--text)">
              {dictionary.entries.slice(0, previewLimit).map(entry => <li className="wrap-break-word py-1" key={entry.id}>{entry.id}: {entry.name}</li>)}
            </ul>
            {dictionary.entries.length > previewLimit && <Note className="leading-normal">{uk ? formatMessage(ukrainianCopy.показаноПершіЗаписів, { previewLimit }) : `Showing the first ${previewLimit} entries.`}</Note>}
          </details>
        );
      })}
    </div>
  );
}
