import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { qualityLabel } from "@/lib/data-quality-copy";
import type { Lang } from "@/lib/translations";
import type { Quality } from "../data-quality-card/data-quality-types";
import { productKindLabel, qualityAmountLabel } from "../data-quality-card/data-quality-labels";

export function DataQualityMovements({ components, orderExceptions, replayRequired, lang }: {
  components: Quality["components"];
  orderExceptions: Quality["orderExceptions"];
  replayRequired: number;
  lang: Lang;
}) {
  const uk = lang === "uk";
  const locale = uk ? "uk-UA" : "en-GB";
  const label = (code: string) => qualityLabel(code, lang);
  const kindLabel = (kind: string) => productKindLabel(kind, lang);
  const value = (amount: string | null, currency: string | null) => qualityAmountLabel(amount, currency, lang);
  return (
    <>
      <Heading as="h3" variant="compact" className="mt-6 text-base font-medium">
        {uk ? "Рухи за типом" : "Movement components"}
      </Heading>
      <Text variant="body" className="mt-1 leading-normal text-(--muted)">
        {uk
          ? "Усі збережені поточні рядки замовлень. Це перевірка нормалізації, а не фінансовий звіт за період. Суми без підтвердженої дати не включено."
          : "All retained current order lines. This checks normalization, not a period financial report. Amounts without a verified date are excluded."}
      </Text>
      {replayRequired > 0 && (
        <p className="mt-2 text-sm text-(--text)">
          {uk
            ? "Повторіть історичний імпорт для застосування нових правил до старих рядків:"
            : "Replay history to apply the new rules to older lines:"}{" "}
          {replayRequired.toLocaleString(locale)}
        </p>
      )}
      {components.map((c) => (
        <p
          key={`${c.component}:${c.currency}`}
          className="mt-2 text-sm text-(--text)"
        >
          {c.component === "RETURNS_CORRECTIONS"
            ? uk
              ? "Повернення та коригування"
              : "Returns and corrections"
            : kindLabel(c.component)}
          : {value(c.revenue, c.currency)} ·{" "}
          {c.lineCount.toLocaleString(locale)} {uk ? "рядків" : "lines"};{" "}
          {uk ? "неповні суми" : "missing amounts"}:{" "}
          {c.missingAmountCount.toLocaleString(locale)}
        </p>
      ))}
      {Boolean(orderExceptions?.length) && (
        <details className="mt-4 text-sm text-(--text)">
          <summary className="cursor-pointer focus-visible:outline-solid">
            {uk ? "Рядки замовлень для перевірки" : "Order lines to review"}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {orderExceptions?.map((row, i) => (
              <li
                key={`${row.orderId}:${row.lineId}:${row.code}:${i}`}
                className="wrap-break-word"
              >
                {row.sourceSku ?? (uk ? "SKU невідомий" : "Unknown SKU")}:{" "}
                {label(row.code)} · {uk ? "замовлення" : "order"}{" "}
                {row.orderId}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
