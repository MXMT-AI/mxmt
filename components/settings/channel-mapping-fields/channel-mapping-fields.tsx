import { Field } from "@/components/ui/field/field";
import { control } from "@/components/ui/control-styles/control-styles";
import { Button } from "@/components/ui/button/button";
import type { Lang } from "@/lib/translations";
export interface ChannelMappingRow { code: string; name: string }

export function ChannelMappingFields({ rows, lang, onChange, legend, nameLabel, buttonClassName }: {
  rows: ChannelMappingRow[];
  lang: Lang;
  onChange: (rows: ChannelMappingRow[]) => void;
  legend?: string;
  nameLabel?: string;
  buttonClassName?: string;
}) {
  const copy = (uk: string, en: string) => lang === "uk" ? uk : en;
  function change(index: number, key: keyof ChannelMappingRow, value: string) {
    onChange(rows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-(--text)">{legend ?? copy("Канали", "Channels")}</legend>
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-2 gap-3">
          <Field label={copy("Код каналу", "Channel code")}>
            <input className={control} required value={row.code} onChange={event => change(index, "code", event.target.value)} />
          </Field>
          <Field label={nameLabel ?? copy("Назва", "Name")}>
            <input className={control} required maxLength={200} value={row.name} onChange={event => change(index, "name", event.target.value)} />
          </Field>
        </div>
      ))}
      <Button variant="report" className={buttonClassName} onClick={() => onChange([...rows, { code: "", name: "" }])}>
        {copy("Додати канал", "Add channel")}
      </Button>
    </fieldset>
  );
}
