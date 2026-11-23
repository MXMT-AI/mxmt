import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";
import { settingsCsvHistoryRulesMessages as englishCopy } from "@/messages/en.json";
import { settingsCsvHistoryRulesMessages as ukrainianCopy } from "@/messages/uk.json";

export interface CsvHistoryRuleValues {
  orders: boolean;
  receipts: boolean;
  receiptBaseline: boolean;
  from: string;
  to: string;
}

const dateFields = [
  { key: "from", uk: ukrainianCopy.enStartISOUTC, en: englishCopy.enStartISOUTC, placeholder: "2025-01-01T00:00:00.000Z" },
  { key: "to", uk: ukrainianCopy.en, en: englishCopy.en, placeholder: "2026-10-25T23:59:59.999Z" },
] as const;

export function CsvHistoryRules({ value, lang, onChange }: {
  value: CsvHistoryRuleValues;
  lang: Lang;
  onChange: (value: CsvHistoryRuleValues) => void;
}) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy;
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-(--text)">{copy.verifiedHistoryCoverage}</legend>
      <label className="flex gap-2 text-sm text-(--muted)">
        <input type="checkbox" checked={value.orders} onChange={event => onChange({ ...value, orders: event.target.checked })} />
        {copy.theFileContainsCompleteOrder}
      </label>
      <label className="flex gap-2 text-sm text-(--muted)">
        <input type="checkbox" checked={value.receipts} onChange={event => onChange({ ...value, receipts: event.target.checked })} />
        {copy.theFileContainsCompleteReceipt}
      </label>
      {value.receipts && (
        <label className="flex gap-2 text-sm text-(--muted)">
          <input type="checkbox" checked={value.receiptBaseline} onChange={event => onChange({ ...value, receiptBaseline: event.target.checked })} />
          {copy.thisIncludesEveryReceiptSince}
        </label>
      )}
      {(value.orders || value.receipts) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {dateFields.map(field => (
            <Field key={field.key} label={field[lang]}>
              <input className={control} required placeholder={field.placeholder} value={value[field.key]} onChange={event => onChange({ ...value, [field.key]: event.target.value })} />
            </Field>
          ))}
        </div>
      )}
    </fieldset>
  );
}
