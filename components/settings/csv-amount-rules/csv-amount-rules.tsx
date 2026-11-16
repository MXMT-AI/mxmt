import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { CsvOptions } from "@/lib/connectors/csv/schema";
import type { Lang } from "@/lib/translations";

export type CsvAmountRuleValues = Pick<CsvOptions["policy"]["amounts"], "price" | "absoluteDiscount"> & Pick<CsvOptions, "discountUnit">;

const fields = [
  {
    key: "price",
    label: { uk: "Ціна в рядку", en: "Line price" },
    options: [
      { value: "gross_unit", uk: "За одиницю, до знижки", en: "Unit price before discount" },
      { value: "net_unit", uk: "За одиницю, після знижки", en: "Unit price after discount" },
    ],
  },
  {
    key: "discountUnit",
    label: { uk: "Тип знижки", en: "Discount unit" },
    options: [
      { value: "amount", uk: "Сума", en: "Amount" },
      { value: "percentage", uk: "Відсоток", en: "Percentage" },
    ],
  },
  {
    key: "absoluteDiscount",
    label: { uk: "Абсолютна знижка", en: "Absolute discount" },
    options: [
      { value: "line", uk: "На весь рядок", en: "Per line" },
      { value: "unit", uk: "На одиницю", en: "Per unit" },
    ],
  },
] as const;

export function CsvAmountRules({ value, lang, onChange }: {
  value: CsvAmountRuleValues;
  lang: Lang;
  onChange: (value: CsvAmountRuleValues) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {fields.map(field => (
        <Field key={field.key} label={field.label[lang]}>
          <select
            className={control}
            value={value[field.key]}
            onChange={event => onChange({ ...value, [field.key]: event.target.value })}
          >
            {field.options.map(option => (
              <option key={option.value} value={option.value}>{option[lang]}</option>
            ))}
          </select>
        </Field>
      ))}
    </div>
  );
}
