import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { qualityLabel } from "@/lib/data-quality-copy";
import type { Lang } from "@/lib/translations";
import type { Quality } from "../data-quality-card/data-quality-types";
import { productKindLabel, qualityAmountLabel } from "../data-quality-card/data-quality-labels";
import { settingsDataQualityMovementsMessages as englishCopy } from "@/messages/en.json";
import { settingsDataQualityMovementsMessages as ukrainianCopy } from "@/messages/uk.json";

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
        {uk ? ukrainianCopy.movementComponents : englishCopy.movementComponents}
      </Heading>
      <Text variant="body" className="mt-1 leading-normal text-(--muted)">
        {uk
          ? ukrainianCopy.allRetainedCurrentOrderLines
          : englishCopy.allRetainedCurrentOrderLines}
      </Text>
      {replayRequired > 0 && (
        <p className="mt-2 text-sm text-(--text)">
          {uk
            ? ukrainianCopy.replayHistoryToApplyThe
            : englishCopy.replayHistoryToApplyThe}{" "}
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
              ? ukrainianCopy.returnsAndCorrections
              : englishCopy.returnsAndCorrections
            : kindLabel(c.component)}
          : {value(c.revenue, c.currency)} ·{" "}
          {c.lineCount.toLocaleString(locale)} {uk ? ukrainianCopy.lines : englishCopy.lines};{" "}
          {uk ? ukrainianCopy.missingAmounts : englishCopy.missingAmounts}:{" "}
          {c.missingAmountCount.toLocaleString(locale)}
        </p>
      ))}
      {Boolean(orderExceptions?.length) && (
        <details className="mt-4 text-sm text-(--text)">
          <summary className="cursor-pointer focus-visible:outline-solid">
            {uk ? ukrainianCopy.orderLinesToReview : englishCopy.orderLinesToReview}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {orderExceptions?.map((row, i) => (
              <li
                key={`${row.orderId}:${row.lineId}:${row.code}:${i}`}
                className="wrap-break-word"
              >
                {row.sourceSku ?? (uk ? ukrainianCopy.unknownSKU : englishCopy.unknownSKU)}:{" "}
                {label(row.code)} · {uk ? ukrainianCopy.order : englishCopy.order}{" "}
                {row.orderId}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
