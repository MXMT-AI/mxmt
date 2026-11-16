import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";

export interface CsvReceiptRuleValues {
  postedStatus: string;
  supplierCode: string;
  supplierId: string;
  costVerified: boolean;
}

export function CsvReceiptRules({ value, suppliers, lang, onChange }: {
  value: CsvReceiptRuleValues;
  suppliers: Array<{ id: string; name: string }>;
  lang: Lang;
  onChange: (value: CsvReceiptRuleValues) => void;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  return (
    <fieldset className="grid gap-4 sm:grid-cols-3">
      <legend className="mb-3 text-sm text-(--text)">{copy("Підтверджені приходи", "Verified receipts")}</legend>
      <Field label={copy("Проведений статус", "Posted status code")}>
        <input className={control} required value={value.postedStatus} onChange={event => onChange({ ...value, postedStatus: event.target.value })} />
      </Field>
      <Field label={copy("Код постачальника у файлі", "Supplier code in file")}>
        <input className={control} required value={value.supplierCode} onChange={event => onChange({ ...value, supplierCode: event.target.value })} />
      </Field>
      <Field label={copy("Постачальник", "Supplier")}>
        <select className={control} required value={value.supplierId} onChange={event => onChange({ ...value, supplierId: event.target.value })}>
          <option value="">{copy("Оберіть постачальника", "Choose supplier")}</option>
          {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-(--muted) sm:col-span-3">
        <input type="checkbox" checked={value.costVerified} onChange={event => onChange({ ...value, costVerified: event.target.checked })} />
        {copy("Закупівельна ціна — підтверджена ціна за одиницю.", "Purchase cost is a verified unit cost.")}
      </label>
    </fieldset>
  );
}
