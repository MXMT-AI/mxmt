import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { Note } from "@/components/ui/note/note";
import type { CsvOptions } from "@/lib/connectors/csv/schema";
import type { Lang } from "@/lib/translations";

type PopulationValues = Pick<CsvOptions, "catalog" | "stock">;
const fields = [
  { key: "catalog", uk: "Повнота каталогу", en: "Catalog population" },
  { key: "stock", uk: "Повнота кожного залишку", en: "Population of each stock observation" },
] as const;

export function CsvPopulationRules({ value, lang, onChange }: {
  value: PopulationValues;
  lang: Lang;
  onChange: (value: PopulationValues) => void;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(field => (
          <Field key={field.key} label={field[lang]}>
            <select className={control} value={value[field.key]} onChange={event => onChange({ ...value, [field.key]: event.target.value })}>
              <option value="partial">{copy("Частина товарів", "Partial population")}</option>
              <option value="complete">{copy("Усі товари джерела", "Complete source population")}</option>
            </select>
          </Field>
        ))}
      </div>
      <Note className="leading-normal">{copy(
        "Товари й залишки завантажуються разом. Пропущені товари не обнуляються. Власність брендів і умови постачальників налаштовуються окремо в Settings.",
        "Upload products and stock together. Omitted products are not zeroed. Configure brand ownership and supplier terms separately in Settings.",
      )}</Note>
    </>
  );
}
