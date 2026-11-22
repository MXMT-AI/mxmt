import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { SHEETS_PRODUCT_FIELDS, SHEETS_ORDER_FIELDS, type SheetsColumn } from "@/lib/sheets-mapping-contract";
import type { Lang } from "@/lib/translations";
import { mappingCaption } from "../sheets-mapping-card/copy";
import { settingsSheetsColumnMappingMessages as englishCopy } from "@/messages/en.json";
import { settingsSheetsColumnMappingMessages as ukrainianCopy } from "@/messages/uk.json";

export function SheetsColumnMapping({ resource, value, columns, lang, onChange }: {
  resource: "products" | "orders";
  value: Record<string, string | null>;
  columns: SheetsColumn[];
  lang: Lang;
  onChange: (field: string, column: string | null) => void;
}) {
  const fields = resource === "products" ? SHEETS_PRODUCT_FIELDS : SHEETS_ORDER_FIELDS;
  const visibleColumns = columns.filter(column => column.label);
  return (
    <details open className="rounded-lg border border-(--border) p-3">
      <summary className="cursor-pointer font-medium">{resource === "products" ? englishCopy.productYML20 : englishCopy.zAVODAPI}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(field => (
          <Field key={field} label={mappingCaption(field, lang)}>
            <select className={control} value={value[field] ?? ""} onChange={event => onChange(field, event.target.value || null)}>
              <option value="">{lang === "uk" ? ukrainianCopy.notMapped : englishCopy.notMapped}</option>
              {visibleColumns.map(column => (
                <option key={column.key} value={column.key}>
                  {column.label} ({column.key.replace("col_", "").toUpperCase()})
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
    </details>
  );
}
