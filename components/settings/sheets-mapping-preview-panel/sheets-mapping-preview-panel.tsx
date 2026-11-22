import { Button } from "@/components/ui/button/button";
import { Heading } from "@/components/ui/heading/heading";
import { Text } from "@/components/ui/text/text";
import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";
import type { SheetsMappingPreview } from "@/lib/sheets-mapping-contract";
import { sheetsMappingMessage } from "@/lib/sheets-mapping-copy";
import { mappingCaption } from "../sheets-mapping-card/copy";
import { settingsSheetsMappingPreviewPanelMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsMappingPreviewPanelMessages as ukrainianCopy } from "@/messages/uk.json";

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
      aria-label={uk ? ukrainianCopy.ariaLabelPreviewResults : englishCopy.ariaLabelPreviewResults}
    >
      <Heading as="h3" variant="compact" className="text-base font-medium text-inherit">
        {uk ? ukrainianCopy.mappingPreview : englishCopy.mappingPreview}
      </Heading>
      <Text variant="body" className="leading-normal text-base text-inherit">
        {uk ? ukrainianCopy.products : englishCopy.products}: {preview.summary.counts.products} ·{" "}
        {uk ? ukrainianCopy.orderLines : englishCopy.orderLines}:{" "}
        {preview.summary.counts.orders}
      </Text>
      <Text variant="body" className="leading-normal text-base text-inherit">
        {uk ? ukrainianCopy.rowsNeedingReview : englishCopy.rowsNeedingReview}:{" "}
        {preview.summary.invalidRows.products} /{" "}
        {preview.summary.invalidRows.orders}
      </Text>
      <Text variant="body" className="leading-normal text-base text-inherit text-sm text-(--muted)">
        {uk
          ? ukrainianCopy.historyCompletenessOwnershipAndSupplier
          : englishCopy.historyCompletenessOwnershipAndSupplier}
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
          ? ukrainianCopy.unverifiedStatusesProductKinds
          : englishCopy.unverifiedStatusesProductKinds}
        : {preview.summary.unmappedStatuses} /{" "}
        {preview.summary.unverifiedProductKinds}
      </Text>
      <details>
        <summary className="cursor-pointer">
          {uk ? ukrainianCopy.issues : englishCopy.issues} ({preview.summary.problemCount})
        </summary>
        <ul className="mt-2 max-h-64 overflow-auto text-sm">
          {preview.summary.problems.map((problem, i) => (
            <li key={i}>
              {problem.resource === "products"
                ? uk
                  ? ukrainianCopy.products2
                  : englishCopy.products2
                : uk
                  ? ukrainianCopy.orders
                  : englishCopy.orders}{" "}
              · {uk ? ukrainianCopy.row : englishCopy.row} {problem.row} ·{" "}
              {problem.field ? caption(problem.field) + " · " : ""}
              {sheetsMappingMessage(problem.code, lang)}
            </li>
          ))}
        </ul>
        <Text variant="body" className="leading-normal text-base text-inherit mt-2 text-sm text-(--muted)">
          {uk
            ? ukrainianCopy.upTo100ExamplesAre
            : englishCopy.upTo100ExamplesAre}
        </Text>
      </details>
      <Field label={uk ? ukrainianCopy.labelApprovalReference : englishCopy.labelApprovalReference}>
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
          ? ukrainianCopy.iReviewedFieldsStatusesDates
          : englishCopy.iReviewedFieldsStatusesDates}
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
        {uk ? ukrainianCopy.approveThisRevision : englishCopy.approveThisRevision}
      </Button>
    </section>
  );
}
