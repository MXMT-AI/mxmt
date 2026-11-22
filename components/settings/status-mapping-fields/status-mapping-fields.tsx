"use client";
import { Field } from "@/components/ui/field/field";
import { Button } from "@/components/ui/button/button";
import { control } from "@/components/ui/control-styles/control-styles";
import type { Lang } from "@/lib/translations";
import { settingsStatusMappingFieldsMessages as englishCopy } from "@/messages/en.json";
import { settingsStatusMappingFieldsMessages as ukrainianCopy } from "@/messages/uk.json";
export interface StatusMappingRow {
  id: string;
  kind: string;
}
export interface StatusMappingConfig {
  codePattern: string;
  options: ReadonlyArray<{ value: string; uk: string; en: string }>;
  newRowKind: string;
  maxRows?: number;
}

const defaultConfig: StatusMappingConfig = {
  codePattern: "[0-9]+",
  options: [
    { value: "", uk: ukrainianCopy.enUnverified, en: englishCopy.enUnverified },
    { value: "SALE", uk: ukrainianCopy.enSale, en: englishCopy.enSale },
    { value: "PREORDER", uk: ukrainianCopy.enPreorder, en: englishCopy.enPreorder },
    { value: "REFUSAL", uk: ukrainianCopy.enRefusal, en: englishCopy.enRefusal },
  ],
  newRowKind: "",
  maxRows: 100,
};

export default function StatusMappingFields({
  rows,
  onChange,
  lang,
  config = defaultConfig,
}: {
  config?: StatusMappingConfig;
  rows: StatusMappingRow[];
  onChange: (rows: StatusMappingRow[]) => void;
  lang: Lang;
}) {
  const copy = (uk: string, en: string) => (lang === "uk" ? uk : en);
  const atLimit = config.maxRows !== undefined && rows.length >= config.maxRows;
  function change(index: number, field: keyof StatusMappingRow, value: string) {
    onChange(rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }
  function add() {
    if (!atLimit) onChange([...rows, { id: "", kind: config.newRowKind }]);
  }
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-(--text)">
        {copy(ukrainianCopy.statusMeanings, englishCopy.statusMeanings)}
      </legend>
      {rows.map((s, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <Field label={copy(ukrainianCopy.statusCode, englishCopy.statusCode)}>
            <input
              name={`status-code-${i}`}
              autoComplete="off"
              spellCheck={false}
              className={control}
              value={s.id}
              required
              pattern={config.codePattern}
              onChange={event => change(i, "id", event.target.value)}
            />
          </Field>
          <Field label={copy(ukrainianCopy.meaning, englishCopy.meaning)}>
            <select
              name={`status-meaning-${i}`}
              className={control}
              value={s.kind}
              onChange={event => change(i, "kind", event.target.value)}
            >
              {config.options.map(option => (
                <option key={option.value} value={option.value}>{copy(option.uk, option.en)}</option>
              ))}
            </select>
          </Field>
        </div>
      ))}
      <Button
        variant="report"
        disabled={atLimit}
        className="text-(--text) hover:bg-(--input-hover)"
        onClick={add}
      >
        {copy(ukrainianCopy.addStatus, englishCopy.addStatus)}
      </Button>
    </fieldset>
  );
}
