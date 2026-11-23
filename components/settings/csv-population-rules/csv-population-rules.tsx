import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { Note } from "@/components/ui/note/note";
import type { CsvOptions } from "@/lib/connectors/csv/schema";
import type { Lang } from "@/lib/translations";
import { settingsCsvPopulationRulesMessages as englishCopy } from "@/messages/en.json";
import { settingsCsvPopulationRulesMessages as ukrainianCopy } from "@/messages/uk.json";

type PopulationValues = Pick<CsvOptions, "catalog" | "stock">;
const fields = [
  { key: "catalog", uk: ukrainianCopy.enCatalogPopulation, en: englishCopy.enCatalogPopulation },
  { key: "stock", uk: ukrainianCopy.enPopulationOfEachStockObservation, en: englishCopy.enPopulationOfEachStockObservation },
] as const;

export function CsvPopulationRules({ value, lang, onChange }: {
  value: PopulationValues;
  lang: Lang;
  onChange: (value: PopulationValues) => void;
}) {
  const copy = lang === "uk" ? ukrainianCopy : englishCopy;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(field => (
          <Field key={field.key} label={field[lang]}>
            <select className={control} value={value[field.key]} onChange={event => onChange({ ...value, [field.key]: event.target.value })}>
              <option value="partial">{copy.partialPopulation}</option>
              <option value="complete">{copy.completeSourcePopulation}</option>
            </select>
          </Field>
        ))}
      </div>
      <Note className="leading-normal">{copy.uploadProductsAndStockTogether}</Note>
    </>
  );
}
