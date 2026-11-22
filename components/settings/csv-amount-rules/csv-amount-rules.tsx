import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { CsvOptions } from "@/lib/connectors/csv/schema";
import type { Lang } from "@/lib/translations";
import { settingsCsvAmountRulesMessages as englishCopy } from "@/messages/en.json";
import { settingsCsvAmountRulesMessages as ukrainianCopy } from "@/messages/uk.json";

export type CsvAmountRuleValues = Pick<CsvOptions["policy"]["amounts"], "price" | "absoluteDiscount"> & Pick<CsvOptions, "discountUnit">;

const fields = [
  {
    key: "price",
    label: { uk: ukrainianCopy.enLinePrice, en: englishCopy.enLinePrice },
    options: [
      { value: "gross_unit", uk: ukrainianCopy.enUnitPriceBeforeDiscount, en: englishCopy.enUnitPriceBeforeDiscount },
      { value: "net_unit", uk: ukrainianCopy.enUnitPriceAfterDiscount, en: englishCopy.enUnitPriceAfterDiscount },
    ],
  },
  {
    key: "discountUnit",
    label: { uk: ukrainianCopy.enDiscountUnit, en: englishCopy.enDiscountUnit },
    options: [
      { value: "amount", uk: ukrainianCopy.enAmount, en: englishCopy.enAmount },
      { value: "percentage", uk: ukrainianCopy.enPercentage, en: englishCopy.enPercentage },
    ],
  },
  {
    key: "absoluteDiscount",
    label: { uk: ukrainianCopy.enAbsoluteDiscount, en: englishCopy.enAbsoluteDiscount },
    options: [
      { value: "line", uk: ukrainianCopy.enPerLine, en: englishCopy.enPerLine },
      { value: "unit", uk: ukrainianCopy.enPerUnit, en: englishCopy.enPerUnit },
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
