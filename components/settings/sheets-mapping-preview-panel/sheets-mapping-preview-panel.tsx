import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";
import type { SheetsMappingPreview } from "@/lib/sheets-mapping-contract";
import { sheetsMappingMessage } from "@/lib/sheets-mapping-copy";
import { mappingCaption } from "../sheets-mapping-card/copy";

export function SheetsMappingPreviewPanel({ preview, lang, reference, confirmed, busy, onReferenceChange, onConfirmedChange, onApprove }: {
  preview: SheetsMappingPreview;
  lang: Lang;
  reference: string;
  confirmed: boolean;
  busy: boolean;
  onReferenceChange: (value: string) => void;
  onConfirmedChange: (value: boolean) => void;
  onApprove: () => void;
}) {
  const uk = lang === "uk";
  const caption = (key: string) => mappingCaption(key, lang);
  return (
    <section
      className="mt-5 space-y-3 rounded-lg border border-(--border) p-4"
      aria-label={uk ? "Результат перевірки" : "Preview results"}
    >
      <Heading as="h3" variant="compact" className="text-base font-medium text-inherit">
        {uk ? "Перевірка зіставлення" : "Mapping preview"}
      </Heading>
      <Text variant="body" className="leading-normal text-base text-inherit">
        {uk ? "Товарів" : "Products"}: {preview.summary.counts.products} ·{" "}
        {uk ? "Рядків замовлень" : "Order lines"}:{" "}
        {preview.summary.counts.orders}
      </Text>
      <Text variant="body" className="leading-normal text-base text-inherit">
        {uk ? "Рядків із зауваженнями" : "Rows needing review"}:{" "}
        {preview.summary.invalidRows.products} /{" "}
        {preview.summary.invalidRows.orders}
      </Text>
      <Text variant="body" className="leading-normal text-base text-inherit text-sm text-(--muted)">
        {uk
          ? "Немає підтвердження повноти історії, типу власності та умов постачальників. Невідомі показники не замінюються нулями."
          : "History completeness, ownership and supplier terms require separate evidence. Unknown metrics are not replaced with zero."}
      </Text>
      {preview.summary.blockingErrors.length ? (
        <ul role="alert" className="text-sm text-red-500">
          {preview.summary.blockingErrors.map((code) => (
            <li key={code}>{sheetsMappingMessage(code, lang)}</li>
          ))}
        </ul>
      ) : null}
      <ul className="space-y-1 text-sm text-(--muted)">
        {preview.summary.warnings.map((code) => (
          <li key={code}>{sheetsMappingMessage(code, lang)}</li>
        ))}
      </ul>
      <Text variant="body" className="leading-normal text-base text-inherit text-sm">
        {uk
          ? "Непідтверджених статусів / типів позицій"
          : "Unverified statuses / product kinds"}
        : {preview.summary.unmappedStatuses} /{" "}
        {preview.summary.unverifiedProductKinds}
      </Text>
      <details>
        <summary className="cursor-pointer">
          {uk ? "Зауваження" : "Issues"} ({preview.summary.problemCount})
        </summary>
        <ul className="mt-2 max-h-64 overflow-auto text-sm">
          {preview.summary.problems.map((problem, i) => (
            <li key={i}>
              {problem.resource === "products"
                ? uk
                  ? "Товари"
                  : "Products"
                : uk
                  ? "Замовлення"
                  : "Orders"}{" "}
              · {uk ? "рядок" : "row"} {problem.row} ·{" "}
              {problem.field ? caption(problem.field) + " · " : ""}
              {sheetsMappingMessage(problem.code, lang)}
            </li>
          ))}
        </ul>
        <Text variant="body" className="leading-normal text-base text-inherit mt-2 text-sm text-(--muted)">
          {uk
            ? "Показано до 100 прикладів; кількість вище — за всіма перевіреними рядками."
            : "Up to 100 examples are shown; totals cover every inspected row."}
        </Text>
      </details>
      <Field label={uk ? "Підстава погодження" : "Approval reference"}>
        <input
          className={control}
          name="sheets-mapping-approval-reference"
          autoComplete="off"
          maxLength={1000}
          value={reference}
          disabled={busy}
          onChange={(e) => onReferenceChange(e.target.value)}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => onConfirmedChange(e.target.checked)}
        />
        {uk
          ? "Я перевірив(ла) поля, статуси, дати, одиниці сум і наведені обмеження."
          : "I reviewed fields, statuses, dates, amount units and the stated limitations."}
      </label>
      <Button variant="report"
        type="button"
        className="bg-(--surface) px-3 text-(--text)"
        disabled={
          busy ||
          !confirmed ||
          !reference.trim() ||
          preview.summary.blockingErrors.length > 0
        }
        onClick={onApprove}
      >
        {uk ? "Погодити цю версію" : "Approve this revision"}
      </Button>
    </section>
  );
}
