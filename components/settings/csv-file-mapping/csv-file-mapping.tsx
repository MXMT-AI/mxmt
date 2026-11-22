import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { CSV_FIELDS, CSV_REQUIRED, type CsvFileInput, type CsvResource } from "@/lib/connectors/csv/schema";
import type { Lang } from "@/lib/translations";
import type { CsvFileDraft } from "../csv-import-card/csv-import-types";
import { csvResourceNames as names } from "../csv-import-card/copy";
import { settingsCsvFileMappingMessages as englishCopy } from "@/messages/en.json";
import { settingsCsvFileMappingMessages as ukrainianCopy } from "@/messages/uk.json";

export function CsvFileMapping({ resource, draft, delimiter = ",", lang, onChoose, onDelimiter, onColumnChange }: {
  resource: CsvResource;
  draft?: CsvFileDraft;
  delimiter?: CsvFileInput["delimiter"];
  lang: Lang;
  onChoose: (resource: CsvResource, file: File | undefined) => void | Promise<void>;
  onDelimiter: (resource: CsvResource, delimiter: CsvFileInput["delimiter"]) => void;
  onColumnChange: (resource: CsvResource, field: string, header: string) => void;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  return (
    <details
      id={`csv-file-${resource}`}
      className="rounded-lg border border-(--border) p-3"
    >
      <summary className="cursor-pointer wrap-break-word text-sm text-(--text)">
        {names[lang][resource]}
        {draft ? ` — ${draft.name}` : ""}
      </summary>
      <div className="mt-4 space-y-4">
        <Field label={copy(ukrainianCopy.delimiter, englishCopy.delimiter)}>
          <select
            className={control}
            value={delimiter}
            onChange={(e) =>
              onDelimiter(
                resource,
                e.target.value as CsvFileInput["delimiter"],
              )
            }
          >
            <option value=",">{copy(ukrainianCopy.comma, englishCopy.comma)}</option>
            <option value=";">
              {copy(ukrainianCopy.semicolon, englishCopy.semicolon)}
            </option>
            <option value={"\t"}>{copy(ukrainianCopy.tab, englishCopy.tab)}</option>
          </select>
        </Field>
        <Field label={copy(ukrainianCopy.cSVFile, englishCopy.cSVFile)}>
          <input
            className={control}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              void onChoose(resource, file);
            }}
          />
        </Field>
        <a
          className="inline-block text-sm text-(--accent) underline"
          download={`${resource}-v1.csv`}
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_FIELDS[resource].join(",") + "\n")}`}
        >
          {copy(ukrainianCopy.columnTemplate, englishCopy.columnTemplate)}
        </a>
        {draft && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CSV_FIELDS[resource].map((field) => (
                <Field
                  key={field}
                  label={`${field}${CSV_REQUIRED[resource].includes(field) ? " *" : ""}`}
                >
                  <select
                    className={control}
                    required={CSV_REQUIRED[resource].includes(
                      field,
                    )}
                    value={
                      draft.file.columns[field] ?? ""
                    }
                    onChange={(e) => onColumnChange(resource, field, e.target.value)}
                  >
                    <option value="">
                      {copy(ukrainianCopy.notMapped, englishCopy.notMapped)}
                    </option>
                    {draft.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
