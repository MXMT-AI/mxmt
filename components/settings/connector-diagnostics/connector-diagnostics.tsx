import { Note } from "@/components/ui/note/note";
import type { Lang } from "@/lib/translations";
import { diagnosticsCopy } from "./copy";
import type { ConnectionCheck } from "@/lib/connectors/contract";
import { connectorCheckLabels } from "@/lib/connectors/check-copy";
export default function ConnectorDiagnostics({
  check,
  lang,
}: {
  check: ConnectionCheck | null;
  lang: Lang;
}) {
  if (!check) return null;
  const copy = diagnosticsCopy[lang];
  const codes = connectorCheckLabels(lang);
  const labels: Record<string, string> = copy.resources;
  return (
    <div
      aria-live="polite"
      className="space-y-2 wrap-break-word text-sm text-(--muted)"
    >
      {check.metadata ? (
        <details>
          <summary className="cursor-pointer focus-visible:outline-solid">
            {copy.metadata}
          </summary>
          <p>
            {check.metadata.shopId} · {check.metadata.apiVersion} ·{" "}
            {check.metadata.timezone}
          </p>
          <p className="wrap-break-word">{check.metadata.scopes.join(", ")}</p>
        </details>
      ) : null}
      <ul>
        {check.checks.map((c) => (
          <li key={c.resource}>
            {labels[c.resource] ?? c.resource}: {codes[c.code] ?? c.code}
          </li>
        ))}
      </ul>
      {(["statuses", "channels"] as const).map((k) => (
        <details key={k}>
          <summary className="cursor-pointer focus-visible:outline-solid">
            {labels[k]}
          </summary>
          {!check[k].complete ? (
            <Note className="mt-1 leading-normal text-inherit">
              {check[k].reason === "UNSUPPORTED" ? copy.unsupported : copy.incomplete}
            </Note>
          ) : null}
          <ul>
            {check[k].entries.slice(0, 100).map((d) => (
              <li key={d.id}>
                {d.id}: {d.name}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
