import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";

export interface CsvHistoryRuleValues {
  orders: boolean;
  receipts: boolean;
  receiptBaseline: boolean;
  from: string;
  to: string;
}

const dateFields = [
  { key: "from", uk: "Початок (ISO UTC)", en: "Start (ISO UTC)", placeholder: "2025-01-01T00:00:00.000Z" },
  { key: "to", uk: "Кінець (ISO UTC)", en: "End (ISO UTC)", placeholder: "2026-10-25T23:59:59.999Z" },
] as const;

export function CsvHistoryRules({ value, lang, onChange }: {
  value: CsvHistoryRuleValues;
  lang: Lang;
  onChange: (value: CsvHistoryRuleValues) => void;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-(--text)">{copy("Підтверджене покриття історії", "Verified history coverage")}</legend>
      <label className="flex gap-2 text-sm text-(--muted)">
        <input type="checkbox" checked={value.orders} onChange={event => onChange({ ...value, orders: event.target.checked })} />
        {copy("Файл містить усю історію замовлень за період", "The file contains complete order history for the interval")}
      </label>
      <label className="flex gap-2 text-sm text-(--muted)">
        <input type="checkbox" checked={value.receipts} onChange={event => onChange({ ...value, receipts: event.target.checked })} />
        {copy("Файл містить усі приходи за період", "The file contains complete receipt history for the interval")}
      </label>
      {value.receipts && (
        <label className="flex gap-2 text-sm text-(--muted)">
          <input type="checkbox" checked={value.receiptBaseline} onChange={event => onChange({ ...value, receiptBaseline: event.target.checked })} />
          {copy("Це повна історія приходів від початку діяльності, без попередніх приходів за межами періоду.", "This includes every receipt since the business began, with no earlier receipts outside the interval.")}
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
