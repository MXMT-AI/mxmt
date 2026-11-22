import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";
import type { SheetsFieldMapping } from "@/lib/sheets-mapping-contract";
import { policyFields } from "./policy-fields";
import { settingsSheetsMappingPolicyFieldsMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsMappingPolicyFieldsMessages as ukrainianCopy } from "@/messages/uk.json";

type Policy = SheetsFieldMapping["policy"];

export function SheetsMappingPolicyFields({ policy, lang, onChange }: {
  policy: Policy;
  lang: Lang;
  onChange: (update: (policy: Policy) => void) => void;
}) {
  function change<K extends keyof Policy>(key: K, value: Policy[K]) {
    onChange(draft => { draft[key] = value; });
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={lang === "uk" ? ukrainianCopy.labelCurrencyISO4217 : englishCopy.labelCurrencyISO4217}>
          <input className={control} name="sheets-currency" autoComplete="off" maxLength={3} placeholder={englishCopy.placeholderUAH} value={policy.currency} onChange={event => change("currency", event.target.value.toUpperCase())} />
        </Field>
        {policyFields.map(field => (
          <Field key={field.key} label={field[lang]}>
            <select className={control} value={policy[field.key]} onChange={event => {
              const selected = field.options.find(option => option.value === event.target.value);
              if (selected) change(field.key, selected.value);
            }}>
              {field.options.map(option => <option key={option.value} value={option.value}>{option[lang]}</option>)}
            </select>
          </Field>
        ))}
      </div>
      {policy.stockObservation !== "unverified" && (
        <Field label={lang === "uk" ? ukrainianCopy.labelStockTimestampEvidenceReference : englishCopy.labelStockTimestampEvidenceReference}>
          <input className={control} name="stock-observation-reference" autoComplete="off" maxLength={1000} value={policy.stockReference} onChange={event => change("stockReference", event.target.value)} />
        </Field>
      )}
    </>
  );
}
