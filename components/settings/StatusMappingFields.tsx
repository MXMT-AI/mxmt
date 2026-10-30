"use client";
import { Field, control } from "@/components/merchandising/FormControls";
export interface StatusMappingRow {
  id: string;
  kind: string;
}
export default function StatusMappingFields({
  rows,
  onChange,
  lang,
}: {
  rows: StatusMappingRow[];
  onChange: (rows: StatusMappingRow[]) => void;
  lang: "uk" | "en";
}) {
  const copy = (uk: string, en: string) => (lang === "uk" ? uk : en);
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-(--text)">
        {copy("Значення статусів", "Status meanings")}
      </legend>
      {rows.map((s, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <Field label={copy("Код статусу", "Status code")}>
            <input
              name={`status-code-${i}`}
              autoComplete="off"
              spellCheck={false}
              className={control}
              value={s.id}
              required
              pattern="[0-9]+"
              onChange={(e) =>
                onChange(
                  rows.map((x, j) =>
                    i === j ? { ...x, id: e.target.value } : x,
                  ),
                )
              }
            />
          </Field>
          <Field label={copy("Значення", "Meaning")}>
            <select
              name={`status-meaning-${i}`}
              className={control}
              value={s.kind}
              onChange={(e) =>
                onChange(
                  rows.map((x, j) =>
                    i === j ? { ...x, kind: e.target.value } : x,
                  ),
                )
              }
            >
              <option value="">{copy("Не підтверджено", "Unverified")}</option>
              <option value="SALE">{copy("Продаж", "Sale")}</option>
              <option value="PREORDER">
                {copy("Передзамовлення", "Preorder")}
              </option>
              <option value="REFUSAL">{copy("Відмова", "Refusal")}</option>
            </select>
          </Field>
        </div>
      ))}
      <button
        type="button"
        disabled={rows.length >= 100}
        className="min-h-11 rounded-lg border border-(--border) px-4 py-2 text-sm text-(--text) hover:bg-(--input-hover) focus-visible:outline-solid disabled:opacity-50"
        onClick={() => onChange([...rows, { id: "", kind: "" }])}
      >
        {copy("Додати статус", "Add status")}
      </button>
    </fieldset>
  );
}
