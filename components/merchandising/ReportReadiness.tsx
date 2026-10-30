import { Link } from "@/i18n/navigation";
import type { Lang } from "@/lib/translations";
import type { readReportReadiness } from "@/lib/report-readiness";
import { panel } from "./ReportPrimitives";

/** Explain unavailable metrics once using frozen evidence, with links to the relevant settings. */
export default function ReportReadiness({ data, lang }: { data: Awaited<ReturnType<typeof readReportReadiness>>; lang: Lang }) {
  const uk = lang === "uk";
  const reasons = [
    [data.missingStock, uk ? "SKU без підтвердженого залишку на дату знімка. Історичні записи збережені окремо; це не нульовий залишок." : "SKUs without verified stock on the snapshot date. Historical records are retained separately; missing stock is not zero."],
    [data.missingReceipt, uk ? "SKU без підтвердженої історії надходжень. Класифікація й STR недоступні." : "SKUs without verified receipt history. Classification and STR are unavailable."],
    [data.missingVelocity, uk ? "SKU без достатньої історії для швидкості продажів. WOH і дозамовлення недоступні." : "SKUs without sufficient sales exposure history. WOH and reordering are unavailable."],
    [data.unknownOwnership, uk ? "товарних SKU без погодженої власності. Маржа й допуск до уцінки потребують правил бренду або товару." : "merchandise SKUs without approved ownership. Margin and markdown eligibility require brand or product terms."],
    [data.unknownKind, uk ? "SKU потребують перевірки типу товару." : "SKUs need product-type review."],
  ] as const;
  if (data.unclassified === 0 && !reasons.some(([count]) => count > 0)) return null;
  return <aside className={panel + " p-4 space-y-3"} aria-label={uk ? "Що потрібно для повних звітів" : "Report requirements"}>
    <h2 className="font-semibold">{uk ? "Що потрібно для повних звітів" : "What these reports still need"}</h2>
    <p className="text-xs text-(--muted)">{uk ? "За всім джерелом у цьому знімку; поточні фільтри не змінюють ці лічильники. Оновлення перегляду не додає відсутню історію чи погодження." : "For the entire source in this snapshot; display filters do not change these counts. Refreshing does not supply missing history or approvals."}</p>
    {reasons.some(([count]) => count > 0) ? <ul className="list-disc pl-5 space-y-2 text-sm">{reasons.filter(([count]) => count > 0).map(([count, text]) => <li key={text}><strong className="tabular-nums">{new Intl.NumberFormat(uk ? "uk-UA" : "en-GB").format(count)}</strong> {text}</li>)}</ul> : null}
    {data.unclassified > 0 ? <p className="text-sm">{uk ? "Порожня переоцінка або відсутність рекомендацій не означають, що неліквіду чи дефіциту немає: класифікація частини товарів недоступна." : "An empty markdown or recommendation list does not prove there is no dead stock or shortage: some products cannot yet be classified."}</p> : null}
    <div className="flex flex-wrap gap-4 text-sm">
      <Link className="underline underline-offset-4 focus-visible:outline-2" href="/settings?tab=general#data-quality-title">{uk ? "Перевірити якість даних" : "Review data quality"}</Link>
      <Link className="underline underline-offset-4 focus-visible:outline-2" href="/settings?tab=merchandising">{uk ? "Налаштувати власність і постачальників" : "Configure ownership and suppliers"}</Link>
    </div>
  </aside>;
}
