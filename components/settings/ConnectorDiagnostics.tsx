import type { ConnectionCheck } from "@/lib/connectors/contract";
import { connectorCheckLabels } from "@/lib/connectors/check-copy";
export default function ConnectorDiagnostics({
  check,
  lang,
}: {
  check: ConnectionCheck | null;
  lang: "uk" | "en";
}) {
  if (!check) return null;
  const uk = lang === "uk",
    codes = connectorCheckLabels(lang),
    labels: Record<string, string> = {
      orders: uk ? "Замовлення" : "Orders",
      statuses: uk ? "Статуси" : "Statuses",
      channels: uk ? "Канали" : "Channels",
      catalog: uk ? "Каталог" : "Catalog",
      products: uk ? "Товари" : "Products",
      offers: uk ? "Варіанти" : "Offers",
      stock: uk ? "Залишки" : "Stock",
      receipts: uk ? "Приходи" : "Receipts",
    };
  return (
    <div
      aria-live="polite"
      className="space-y-2 break-words text-sm text-[var(--muted)]"
    >
      <ul>
        {check.checks.map((c) => (
          <li key={c.resource}>
            {labels[c.resource] ?? c.resource}: {codes[c.code] ?? c.code}
          </li>
        ))}
      </ul>
      {(["statuses", "channels"] as const).map((k) => (
        <details key={k}>
          <summary className="cursor-pointer focus-visible:outline">
            {labels[k]}
          </summary>
          {!check[k].complete ? (
            <p className="mt-1 text-xs">
              {check[k].reason === "UNSUPPORTED"
                ? uk
                  ? "Не підтримується джерелом."
                  : "Unavailable from this source."
                : uk
                  ? "Довідник неповний. Повне читання виконується під час синхронізації."
                  : "The dictionary is incomplete. Full reads run during synchronization."}
            </p>
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
